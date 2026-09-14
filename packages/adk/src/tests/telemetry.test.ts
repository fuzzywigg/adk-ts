import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "../events/event";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
import {
	TelemetryService,
	initializeTelemetry,
	shutdownTelemetry,
	telemetryService,
	traceLlmCall,
	traceToolCall,
} from "../telemetry";
import type { BaseTool } from "../tools";

const { startMock, shutdownMock, NodeSDKMock, diagWarn, diagError, diagDebug } =
	vi.hoisted(() => {
		const startMock = vi.fn();
		const shutdownMock = vi.fn().mockResolvedValue(undefined);
		const NodeSDKMock = vi.fn(function NodeSDK(this: any) {
			this.start = startMock;
			this.shutdown = shutdownMock;
		});
		return {
			startMock,
			shutdownMock,
			NodeSDKMock,
			diagWarn: vi.fn(),
			diagError: vi.fn(),
			diagDebug: vi.fn(),
		};
	});

vi.mock("@opentelemetry/sdk-node", () => ({
	NodeSDK: NodeSDKMock,
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
	OTLPTraceExporter: vi.fn(),
}));

vi.mock("@opentelemetry/auto-instrumentations-node", () => ({
	getNodeAutoInstrumentations: vi.fn(() => []),
}));

vi.mock("@opentelemetry/resources", () => ({
	resourceFromAttributes: vi.fn((attrs) => attrs),
}));

afterEach(() => {
	vi.restoreAllMocks();
	vi.doUnmock("@opentelemetry/api");
	startMock.mockReset();
	shutdownMock.mockReset().mockResolvedValue(undefined);
	NodeSDKMock.mockClear();
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

	it("uses placeholders when functionResponse is missing and serializes circular args", async () => {
		const setAttributes = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent: vi.fn(),
		} as any);

		const service = new TelemetryService();
		const circular: any = { q: "hi" };
		circular.self = circular;
		service.traceToolCall(
			fakeTool("lookup"),
			circular,
			fakeEvent({
				content: { role: "user", parts: [{ text: "no-fn" }] },
			} as any),
		);

		expect(setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				"gen_ai.tool.call.id": "<not specified>",
				"adk.tool_call_args": "<not serializable>",
			}),
		);
	});

	it("strips response_schema/nulls and maps functions in llm request config", async () => {
		const setAttributes = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent: vi.fn(),
		} as any);
		const prev = process.env.NODE_ENV;
		process.env.NODE_ENV = "test";

		const service = new TelemetryService();
		service.traceLlmCall(
			{
				invocationId: "inv",
				userId: "u",
				session: { id: "s" },
			} as any,
			"evt",
			{
				model: "m",
				config: {
					temperature: 0.2,
					response_schema: { type: "object" },
					nullableField: null,
					functions: [
						{
							name: "fn",
							description: "d",
							parameters: { type: "object" },
							handler: () => {},
						},
					],
				},
				contents: [],
			} as any,
			{ content: { role: "model", parts: [] } } as LlmResponse,
		);

		const attrs = setAttributes.mock.calls[0][0];
		const request = JSON.parse(attrs["adk.llm_request"]);
		expect(request.config.response_schema).toBeUndefined();
		expect(request.config.nullableField).toBeUndefined();
		expect(request.config.functions).toEqual([
			{ name: "fn", description: "d", parameters: { type: "object" } },
		]);
		expect(attrs["deployment.environment.name"]).toBe("test");
		if (prev === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = prev;
	});
});

describe("TelemetryService.initialize and shutdown", () => {
	it("initializes once and warns on second call", async () => {
		const { diag } = await import("@opentelemetry/api");
		vi.spyOn(diag, "warn").mockImplementation(diagWarn);
		vi.spyOn(diag, "debug").mockImplementation(diagDebug);
		vi.spyOn(diag, "error").mockImplementation(diagError);
		vi.spyOn(diag, "setLogger").mockImplementation(() => {});

		const service = new TelemetryService();
		service.initialize({
			appName: "adk-tests",
			appVersion: "1.2.3",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		expect(service.initialized).toBe(true);
		expect(service.getConfig()?.appName).toBe("adk-tests");
		expect(NodeSDKMock).toHaveBeenCalledTimes(1);
		expect(startMock).toHaveBeenCalledTimes(1);

		service.initialize({
			appName: "again",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		expect(diagWarn).toHaveBeenCalledWith(
			"Telemetry is already initialized. Skipping.",
		);
		expect(NodeSDKMock).toHaveBeenCalledTimes(1);

		await service.shutdown();
		expect(service.initialized).toBe(false);
		expect(shutdownMock).toHaveBeenCalled();
	});

	it("rethrows when SDK start fails", async () => {
		const { diag } = await import("@opentelemetry/api");
		vi.spyOn(diag, "error").mockImplementation(diagError);
		vi.spyOn(diag, "setLogger").mockImplementation(() => {});
		startMock.mockImplementationOnce(() => {
			throw new Error("start failed");
		});

		const service = new TelemetryService();
		expect(() =>
			service.initialize({
				appName: "adk-tests",
				otlpEndpoint: "http://localhost:4318/v1/traces",
			}),
		).toThrow("start failed");
		expect(diagError).toHaveBeenCalled();
	});

	it("warns on shutdown timeout and errors on non-timeout failures", async () => {
		const { diag } = await import("@opentelemetry/api");
		vi.spyOn(diag, "warn").mockImplementation(diagWarn);
		vi.spyOn(diag, "error").mockImplementation(diagError);
		vi.spyOn(diag, "debug").mockImplementation(diagDebug);
		vi.spyOn(diag, "setLogger").mockImplementation(() => {});

		const service = new TelemetryService();
		shutdownMock.mockImplementationOnce(() => new Promise(() => {}));
		service.initialize({
			appName: "adk-tests",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		await expect(service.shutdown(20)).rejects.toThrow(/timeout/);
		expect(diagWarn).toHaveBeenCalledWith(expect.stringContaining("timed out"));

		const service2 = new TelemetryService();
		service2.initialize({
			appName: "adk-tests",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		shutdownMock.mockRejectedValueOnce(new Error("shutdown boom"));
		await expect(service2.shutdown()).rejects.toThrow("shutdown boom");
		expect(diagError).toHaveBeenCalled();
	});
});

describe("telemetry module exports", () => {
	it("delegates helpers to the singleton service", () => {
		expect(telemetryService).toBeInstanceOf(TelemetryService);
		const initSpy = vi
			.spyOn(telemetryService, "initialize")
			.mockImplementation(() => {});
		const shutSpy = vi
			.spyOn(telemetryService, "shutdown")
			.mockResolvedValue(undefined);
		const toolSpy = vi
			.spyOn(telemetryService, "traceToolCall")
			.mockImplementation(() => {});
		const llmSpy = vi
			.spyOn(telemetryService, "traceLlmCall")
			.mockImplementation(() => {});

		initializeTelemetry({
			appName: "x",
			otlpEndpoint: "http://localhost",
		});
		expect(initSpy).toHaveBeenCalled();
		traceToolCall(fakeTool(), {}, fakeEvent());
		expect(toolSpy).toHaveBeenCalled();
		traceLlmCall(
			{ invocationId: "i", userId: "u", session: { id: "s" } } as any,
			"e",
			{ model: "m", config: {}, contents: [] } as LlmRequest,
			{} as LlmResponse,
		);
		expect(llmSpy).toHaveBeenCalled();
		void shutdownTelemetry(1);
		expect(shutSpy).toHaveBeenCalledWith(1);
	});
});

describe("TelemetryService edge coverage", () => {
	it("omits session/user attributes when invocationContext is missing on tool calls", async () => {
		const setAttributes = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent: vi.fn(),
		} as any);

		const service = new TelemetryService();
		service.traceToolCall(
			fakeTool("t"),
			{ a: 1 },
			fakeEvent({
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c1",
								name: "t",
								response: { v: 1 },
							},
						},
					],
				},
			} as any),
		);

		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["session.id"]).toBeUndefined();
		expect(attrs["user.id"]).toBeUndefined();
		expect(attrs["adk.llm_request"]).toBe("{}");
	});

	it("uses placeholders when parts are empty or functionResponse has no id", async () => {
		const setAttributes = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent: vi.fn(),
		} as any);
		const service = new TelemetryService();

		service.traceToolCall(
			fakeTool(),
			{},
			fakeEvent({ content: { role: "user", parts: [] } } as any),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(
			"<not specified>",
		);

		service.traceToolCall(
			fakeTool(),
			{},
			fakeEvent({
				content: {
					role: "user",
					parts: [{ functionResponse: { name: "x", response: {} } }],
				},
			} as any),
		);
		expect(setAttributes.mock.calls[1][0]["gen_ai.tool.call.id"]).toBe(
			"<not specified>",
		);
	});

	it("filters inlineData from traced llm contents and defaults missing token fields", async () => {
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
				invocationId: "inv",
				userId: "u",
				session: { id: "s" },
			} as any,
			"evt",
			{
				model: "m",
				config: {},
				contents: [
					{
						role: "user",
						parts: [
							{ text: "keep" },
							{ inlineData: { data: "deadbeef", mimeType: "text/plain" } },
						],
					},
					{ role: "model", parts: undefined },
				],
			} as any,
			{
				usageMetadata: {},
			} as LlmResponse,
		);

		const request = JSON.parse(
			setAttributes.mock.calls[0][0]["adk.llm_request"],
		);
		expect(request.contents[0].parts).toEqual([{ text: "keep" }]);
		expect(request.contents[1].parts).toEqual([]);
		expect(setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				"gen_ai.usage.input_tokens": 0,
				"gen_ai.usage.output_tokens": 0,
			}),
		);
		expect(addEvent).toHaveBeenCalledWith(
			"gen_ai.content.completion",
			expect.objectContaining({
				"gen_ai.completion": expect.any(String),
			}),
		);
	});

	it("defaults missing model config numeric fields to 0", async () => {
		const setAttributes = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent: vi.fn(),
		} as any);

		const service = new TelemetryService();
		service.traceLlmCall(
			{
				invocationId: "inv",
				userId: "u",
				session: { id: "s" },
			} as any,
			"evt",
			{ model: "m", config: {}, contents: [] } as any,
			{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
		);

		expect(setAttributes.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				"gen_ai.request.max_tokens": 0,
				"gen_ai.request.temperature": 0,
				"gen_ai.request.top_p": 0,
			}),
		);
	});

	it("does not set usage attributes when usageMetadata is absent", async () => {
		const setAttributes = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent: vi.fn(),
		} as any);

		const service = new TelemetryService();
		service.traceLlmCall(
			{
				invocationId: "inv",
				userId: "u",
				session: { id: "s" },
			} as any,
			"evt",
			{ model: "m", config: {}, contents: undefined } as any,
			{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
		);

		const usageCalls = setAttributes.mock.calls.filter(
			(call) => call[0]["gen_ai.usage.input_tokens"] !== undefined,
		);
		expect(usageCalls).toHaveLength(0);
		const request = JSON.parse(
			setAttributes.mock.calls[0][0]["adk.llm_request"],
		);
		expect(request.contents).toEqual([]);
	});

	it("serializes circular llm responses as not serializable", async () => {
		const setAttributes = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent: vi.fn(),
		} as any);

		const circular: any = { content: { role: "model", parts: [] } };
		circular.self = circular;

		const service = new TelemetryService();
		service.traceLlmCall(
			{
				invocationId: "inv",
				userId: "u",
				session: { id: "s" },
			} as any,
			"evt",
			{ model: "m", config: {}, contents: [] } as any,
			circular as LlmResponse,
		);

		expect(setAttributes.mock.calls[0][0]["adk.llm_response"]).toBe(
			"<not serializable>",
		);
	});

	it("records non-Error throws from async generators with undefined message", async () => {
		const end = vi.fn();
		const recordException = vi.fn();
		const setStatus = vi.fn();
		const startSpan = vi.fn(() => ({ end, recordException, setStatus }));

		const service = new TelemetryService();
		(service as any).tracer = { startSpan };

		async function* gen(): AsyncGenerator<number, void, unknown> {
			yield 1;
			throw "string-failure";
		}

		const iterator = service.traceAsyncGenerator("boom", gen());
		await expect(iterator.next()).resolves.toEqual({ value: 1, done: false });
		await expect(iterator.next()).rejects.toBe("string-failure");
		expect(recordException).toHaveBeenCalledWith("string-failure");
		expect(setStatus).toHaveBeenCalledWith({
			code: 2,
			message: undefined,
		});
		expect(end).toHaveBeenCalled();
	});

	it("passes otlp headers and wires http ignoreIncomingRequestHook", async () => {
		const { diag } = await import("@opentelemetry/api");
		const { getNodeAutoInstrumentations } = await import(
			"@opentelemetry/auto-instrumentations-node"
		);
		const { OTLPTraceExporter } = await import(
			"@opentelemetry/exporter-trace-otlp-http"
		);
		vi.spyOn(diag, "setLogger").mockImplementation(() => {});
		vi.spyOn(diag, "debug").mockImplementation(diagDebug);

		const service = new TelemetryService();
		service.initialize({
			appName: "adk-tests",
			appVersion: "9.9.9",
			otlpEndpoint: "http://localhost:4318/v1/traces",
			otlpHeaders: { Authorization: "Bearer t" },
			environment: "staging",
		});

		expect(OTLPTraceExporter).toHaveBeenCalledWith({
			url: "http://localhost:4318/v1/traces",
			headers: { Authorization: "Bearer t" },
		});
		expect(getNodeAutoInstrumentations).toHaveBeenCalled();
		const autoOpts = (getNodeAutoInstrumentations as any).mock.calls.at(-1)[0];
		expect(
			autoOpts["@opentelemetry/instrumentation-http"].ignoreIncomingRequestHook(
				{},
			),
		).toBe(true);
		expect(service.getConfig()?.appVersion).toBe("9.9.9");
		expect(service.getTracer()).toBeTruthy();

		await service.shutdown();
		expect(service.initialized).toBe(false);
		await expect(service.shutdown()).resolves.toBeUndefined();
	});

	it("omits deployment.environment.name when NODE_ENV is unset", async () => {
		const setAttributes = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent: vi.fn(),
		} as any);
		const prev = process.env.NODE_ENV;
		delete process.env.NODE_ENV;

		const service = new TelemetryService();
		service.traceToolCall(
			fakeTool(),
			{},
			fakeEvent({
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "x",
								name: "t",
								response: null,
							},
						},
					],
				},
			} as any),
			undefined,
			{
				invocationId: "inv",
				userId: "u",
				session: { id: "s" },
			} as any,
		);

		expect(
			setAttributes.mock.calls[0][0]["deployment.environment.name"],
		).toBeUndefined();
		if (prev === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = prev;
	});

	it("includes llm request payload when provided to traceToolCall", async () => {
		const setAttributes = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent: vi.fn(),
		} as any);

		const service = new TelemetryService();
		service.traceToolCall(
			fakeTool("calc"),
			{ n: 2 },
			fakeEvent({
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "call-9",
								name: "calc",
								response: { sum: 3 },
							},
						},
					],
				},
			} as any),
			{
				model: "gpt",
				config: { temperature: 1 },
				contents: [{ role: "user", parts: [{ text: "2+1" }] }],
			} as LlmRequest,
		);

		const request = JSON.parse(
			setAttributes.mock.calls[0][0]["adk.llm_request"],
		);
		expect(request.model).toBe("gpt");
		expect(request.config.temperature).toBe(1);
		expect(request.contents[0].parts[0].text).toBe("2+1");
	});
});
