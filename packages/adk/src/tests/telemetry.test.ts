import { afterEach, describe, expect, it, vi } from "vitest";
import { diag } from "@opentelemetry/api";
import type { Event } from "../events/event";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
import {
	initializeTelemetry,
	shutdownTelemetry,
	TelemetryService,
	traceLlmCall,
	traceToolCall,
	tracer,
} from "../telemetry";
import type { BaseTool } from "../tools";

afterEach(() => {
	vi.restoreAllMocks();
	vi.doUnmock("@opentelemetry/api");
});

function fakeTool(name = "search"): BaseTool {
	return {
		name,
		description: "search the web",
	} as BaseTool;
}

function fakeEvent(overrides: Partial<Event> = {}): Event {
	return {
		invocationId: "inv-1",
		author: "agent",
		...overrides,
	} as Event;
}

describe("TelemetryService without active span", () => {
	it("starts uninitialized with null config", () => {
		const service = new TelemetryService();
		expect(service.initialized).toBe(false);
		expect(service.getConfig()).toBeNull();
		expect(service.getTracer()).toBeTruthy();
	});

	it("no-ops traceToolCall and traceLlmCall when no span is active", () => {
		const service = new TelemetryService();
		const invocationContext = {
			invocationId: "inv",
			userId: "user",
			session: { id: "sess" },
		} as any;

		expect(() =>
			service.traceToolCall(fakeTool(), { q: "hi" }, fakeEvent()),
		).not.toThrow();

		expect(() =>
			service.traceLlmCall(
				invocationContext,
				"evt-1",
				{
					model: "gemini-2.5-flash",
					config: {},
					contents: [],
				} as LlmRequest,
				{ content: { role: "model", parts: [{ text: "ok" }] } } as LlmResponse,
			),
		).not.toThrow();
	});

	it("shutdown warns and returns when not initialized", async () => {
		const service = new TelemetryService();
		await expect(service.shutdown()).resolves.toBeUndefined();
	});
});

describe("TelemetryService.traceAsyncGenerator", () => {
	it("yields values and ends the span", async () => {
		const end = vi.fn();
		const recordException = vi.fn();
		const setStatus = vi.fn();
		const startSpan = vi.fn(() => ({ end, recordException, setStatus }));

		const service = new TelemetryService();
		(service as any).tracer = { startSpan };

		async function* gen() {
			yield 1;
			yield 2;
		}

		const values: number[] = [];
		for await (const value of service.traceAsyncGenerator("work", gen())) {
			values.push(value);
		}

		expect(values).toEqual([1, 2]);
		expect(startSpan).toHaveBeenCalledWith("work");
		expect(end).toHaveBeenCalledTimes(1);
		expect(recordException).not.toHaveBeenCalled();
	});

	it("records exceptions and rethrows", async () => {
		const end = vi.fn();
		const recordException = vi.fn();
		const setStatus = vi.fn();
		const startSpan = vi.fn(() => ({ end, recordException, setStatus }));

		const service = new TelemetryService();
		(service as any).tracer = { startSpan };

		async function* gen(): AsyncGenerator<number, void, unknown> {
			yield 1;
			throw new Error("generator failed");
		}

		const iterator = service.traceAsyncGenerator("boom", gen());
		await expect(iterator.next()).resolves.toEqual({
			value: 1,
			done: false,
		});
		await expect(iterator.next()).rejects.toThrow("generator failed");
		expect(recordException).toHaveBeenCalled();
		expect(setStatus).toHaveBeenCalledWith({
			code: 2,
			message: "generator failed",
		});
		expect(end).toHaveBeenCalled();
	});
});

describe("TelemetryService with mocked active span", () => {
	it("sets tool-call attributes from function responses", async () => {
		const setAttributes = vi.fn();
		const addEvent = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent,
		} as any);

		const service = new TelemetryService();
		service.traceToolCall(
			fakeTool("lookup"),
			{ city: "Paris" },
			fakeEvent({
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "call-1",
								name: "lookup",
								response: { ok: true },
							},
						},
					],
				},
			} as any),
			{
				model: "gpt-4o",
				config: { temperature: 0.2 },
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			} as LlmRequest,
			{
				invocationId: "inv",
				userId: "u1",
				session: { id: "s1" },
			} as any,
		);

		expect(setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				"gen_ai.tool.name": "lookup",
				"gen_ai.tool.call.id": "call-1",
				"session.id": "s1",
				"user.id": "u1",
			}),
		);
	});

	it("sets llm-call attributes and content events", async () => {
		const setAttributes = vi.fn();
		const addEvent = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent,
		} as any);

		const service = new TelemetryService();
		service.traceLlmCall(
			{
				invocationId: "inv-9",
				userId: "user-9",
				session: { id: "sess-9" },
			} as any,
			"event-9",
			{
				model: "gemini-2.5-flash",
				config: {
					maxOutputTokens: 100,
					temperature: 0.5,
					topP: 0.9,
					response_schema: { type: "object" },
				},
				contents: [
					{
						role: "user",
						parts: [{ text: "hello" }, { inlineData: { data: "x" } }],
					},
				],
			} as any,
			{
				content: { role: "model", parts: [{ text: "world" }] },
				usageMetadata: {
					promptTokenCount: 3,
					candidatesTokenCount: 4,
				},
			} as LlmResponse,
		);

		expect(setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				"gen_ai.request.model": "gemini-2.5-flash",
				"session.id": "sess-9",
				"adk.invocation_id": "inv-9",
				"adk.event_id": "event-9",
			}),
		);
		expect(setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				"gen_ai.usage.input_tokens": 3,
				"gen_ai.usage.output_tokens": 4,
			}),
		);
		expect(addEvent).toHaveBeenCalledWith(
			"gen_ai.content.prompt",
			expect.any(Object),
		);
		expect(addEvent).toHaveBeenCalledWith(
			"gen_ai.content.completion",
			expect.any(Object),
		);
	});
});

describe("TelemetryService private helpers", () => {
	it("safeJsonStringify returns placeholder for circular objects", () => {
		const service = new TelemetryService();
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect((service as any)._safeJsonStringify(circular)).toBe(
			"<not serializable>",
		);
		expect((service as any)._safeJsonStringify({ ok: true })).toBe(
			'{"ok":true}',
		);
	});

	it("buildLlmRequestForTrace drops inlineData parts", () => {
		const service = new TelemetryService();
		const traced = (service as any)._buildLlmRequestForTrace({
			model: "gpt-4o",
			config: { temperature: 0.1 },
			contents: [
				{
					role: "user",
					parts: [
						{ text: "hi" },
						{ inlineData: { mimeType: "image/png", data: "abc" } },
					],
				},
			],
		});

		expect(traced.model).toBe("gpt-4o");
		expect(traced.contents).toEqual([
			{ role: "user", parts: [{ text: "hi" }] },
		]);
	});

	it("excludeNonSerializableFromConfig drops response_schema and nulls", () => {
		const service = new TelemetryService();
		const cleaned = (service as any)._excludeNonSerializableFromConfig({
			temperature: 0.5,
			response_schema: { type: "object" },
			topP: null,
			unused: undefined,
			functions: [
				{
					name: "fn",
					description: "d",
					parameters: { type: "object" },
					impl: () => {},
				},
			],
		});

		expect(cleaned).toEqual({
			temperature: 0.5,
			functions: [
				{
					name: "fn",
					description: "d",
					parameters: { type: "object" },
				},
			],
		});
	});

	it("skips re-initialization when already initialized", () => {
		const service = new TelemetryService();
		(service as any).isInitialized = true;
		const warn = vi.spyOn(diag, "warn");

		service.initialize({
			appName: "adk",
			appVersion: "1.0.0",
			otlpEndpoint: "http://localhost:4318",
		} as any);

		expect(warn).toHaveBeenCalledWith(
			"Telemetry is already initialized. Skipping.",
		);
	});
});

describe("telemetry module exports", () => {
	it("re-exports initializeTelemetry / trace helpers against the singleton", () => {
		expect(typeof initializeTelemetry).toBe("function");
		expect(typeof traceToolCall).toBe("function");
		expect(typeof traceLlmCall).toBe("function");
		expect(typeof shutdownTelemetry).toBe("function");
		expect(tracer).toBeTruthy();
	});
});
