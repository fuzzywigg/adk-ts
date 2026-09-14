import { afterEach, describe, expect, it, vi } from "vitest";
import { Event } from "../events/event";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
import { TelemetryService } from "../telemetry";
import type { BaseTool } from "../tools/base/base-tool";

afterEach(() => {
	vi.restoreAllMocks();
	delete process.env.NODE_ENV;
});

function makeSpan() {
	return {
		setAttributes: vi.fn(),
		addEvent: vi.fn(),
		recordException: vi.fn(),
		setStatus: vi.fn(),
		end: vi.fn(),
	};
}

describe("TelemetryService heavy matrix leftover edges", () => {
	it.each([
		{ label: "undefined", contents: undefined },
		{ label: "null", contents: null },
		{ label: "empty", contents: [] },
	])("_buildLlmRequestForTrace coalesces $label contents to []", ({
		contents,
	}) => {
		const service = new TelemetryService();
		const built = (service as any)._buildLlmRequestForTrace({
			model: "m",
			config: { temperature: 0.1 },
			contents,
		} as LlmRequest);
		expect(built.contents).toEqual([]);
		expect(built.model).toBe("m");
	});

	it("filters inlineData parts and keeps text parts", () => {
		const service = new TelemetryService();
		const built = (service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents: [
				{
					role: "user",
					parts: [
						{ text: "keep" },
						{ inlineData: { data: "abc", mimeType: "text/plain" } },
					],
				},
			],
		} as LlmRequest);
		expect(built.contents[0].parts).toEqual([{ text: "keep" }]);
	});

	it.each([
		{ label: "plain object", value: { a: 1 }, expected: '{"a":1}' },
		{ label: "string", value: "x", expected: '"x"' },
		{ label: "null", value: null, expected: "null" },
	])("_safeJsonStringify $label", ({ value, expected }) => {
		const service = new TelemetryService();
		expect((service as any)._safeJsonStringify(value)).toBe(expected);
	});

	it("_safeJsonStringify returns marker for circular structures", () => {
		const service = new TelemetryService();
		const circular: any = {};
		circular.self = circular;
		expect((service as any)._safeJsonStringify(circular)).toBe(
			"<not serializable>",
		);
	});

	it("traceToolCall no-ops without active span", () => {
		const service = new TelemetryService();
		expect(() =>
			service.traceToolCall(
				{ name: "t", description: "d" } as BaseTool,
				{ a: 1 },
				new Event({ author: "a" }),
			),
		).not.toThrow();
	});

	it("traceToolCall sets attributes with functionResponse coalescing", async () => {
		const span = makeSpan();
		const otel = await import("@opentelemetry/api");
		vi.spyOn(otel.trace, "getActiveSpan").mockReturnValue(span as any);

		const service = new TelemetryService();
		process.env.NODE_ENV = "test";
		const event = new Event({
			author: "tool",
			invocationId: "inv-1",
			content: {
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
		});
		service.traceToolCall(
			{ name: "lookup", description: "d" } as BaseTool,
			{ q: "x" },
			event,
			{ model: "m", contents: [], config: {} } as LlmRequest,
			{
				session: { id: "ses" },
				userId: "u1",
			} as any,
		);
		expect(span.setAttributes).toHaveBeenCalled();
		const attrs = span.setAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.tool.name"]).toBe("lookup");
		expect(attrs["gen_ai.tool.call.id"]).toBe("call-1");
		expect(attrs["session.id"]).toBe("ses");
		expect(attrs["deployment.environment.name"]).toBe("test");
	});

	it.each([
		{
			label: "missing functionResponse id",
			parts: [
				{
					functionResponse: {
						name: "t",
						response: { a: 1 },
					},
				},
			],
			expectedId: "<not specified>",
		},
		{
			label: "empty parts",
			parts: [],
			expectedId: "<not specified>",
		},
		{
			label: "no content",
			parts: undefined,
			expectedId: "<not specified>",
		},
	])("traceToolCall functionResponse edge: $label", async ({
		parts,
		expectedId,
	}) => {
		const span = makeSpan();
		const otel = await import("@opentelemetry/api");
		vi.spyOn(otel.trace, "getActiveSpan").mockReturnValue(span as any);
		const service = new TelemetryService();
		const event = new Event({
			author: "t",
			content: parts ? { parts: parts as any } : undefined,
		});
		service.traceToolCall(
			{ name: "t", description: "d" } as BaseTool,
			{},
			event,
		);
		expect(span.setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(
			expectedId,
		);
	});

	it("traceLlmCall includes usage metadata coalescing and events", async () => {
		const span = makeSpan();
		const otel = await import("@opentelemetry/api");
		vi.spyOn(otel.trace, "getActiveSpan").mockReturnValue(span as any);
		const service = new TelemetryService();
		service.traceLlmCall(
			{
				invocationId: "inv",
				session: { id: "ses" },
				userId: "u",
			} as any,
			"evt-1",
			{
				model: "m",
				config: {},
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			} as LlmRequest,
			{
				content: { parts: [{ text: "bye" }] },
				usageMetadata: {},
			} as LlmResponse,
		);
		const attrs = span.setAttributes.mock.calls.at(-1)?.[0];
		expect(attrs["gen_ai.usage.input_tokens"]).toBe(0);
		expect(attrs["gen_ai.usage.output_tokens"]).toBe(0);
		expect(span.addEvent).toHaveBeenCalled();
	});

	it("traceAsyncGenerator yields values and ends span", async () => {
		const service = new TelemetryService();
		const span = makeSpan();
		vi.spyOn(service.getTracer(), "startSpan").mockReturnValue(span as any);

		async function* gen() {
			yield 1;
			yield 2;
		}
		const out: number[] = [];
		for await (const v of service.traceAsyncGenerator("span", gen())) {
			out.push(v);
		}
		expect(out).toEqual([1, 2]);
		expect(span.end).toHaveBeenCalled();
	});

	it("traceAsyncGenerator records exception and rethrows", async () => {
		const service = new TelemetryService();
		const span = makeSpan();
		vi.spyOn(service.getTracer(), "startSpan").mockReturnValue(span as any);

		async function* gen() {
			yield 1;
			throw new Error("gen-fail");
		}
		await expect(async () => {
			for await (const _ of service.traceAsyncGenerator("span", gen())) {
			}
		}).rejects.toThrow("gen-fail");
		expect(span.recordException).toHaveBeenCalled();
		expect(span.setStatus).toHaveBeenCalledWith({
			code: 2,
			message: "gen-fail",
		});
		expect(span.end).toHaveBeenCalled();
	});

	it("initialize is idempotent and shutdown warns when not initialized", async () => {
		const service = new TelemetryService();
		await service.shutdown();
		expect(service.initialized).toBe(false);
		expect(service.getConfig()).toBeNull();
	});
});
