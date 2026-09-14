import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
import { TelemetryService } from "../telemetry";

const { startMock, shutdownMock, NodeSDKMock, getTracerSpy } = vi.hoisted(
	() => {
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
			getTracerSpy: vi.fn(() => ({ startSpan: vi.fn() })),
		};
	},
);

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

vi.mock("@opentelemetry/api", async () => {
	const actual =
		await vi.importActual<typeof import("@opentelemetry/api")>(
			"@opentelemetry/api",
		);
	return {
		...actual,
		diag: {
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
			setLogger: vi.fn(),
			verbose: vi.fn(),
			info: vi.fn(),
		},
		trace: {
			...actual.trace,
			getTracer: (...args: any[]) => getTracerSpy(...args),
			getActiveSpan: actual.trace.getActiveSpan.bind(actual.trace),
			setSpan: actual.trace.setSpan.bind(actual.trace),
		},
	};
});

afterEach(() => {
	vi.clearAllMocks();
	startMock.mockReset();
	shutdownMock.mockReset().mockResolvedValue(undefined);
	NodeSDKMock.mockClear();
	getTracerSpy.mockClear().mockReturnValue({ startSpan: vi.fn() });
});

/**
 * Sixth leftover deepen: tracer version update + usage token 0ish coalescing.
 */
describe("telemetry sixth leftover deepen edges", () => {
	it("initialize updates tracer version from appVersion", () => {
		const service = new TelemetryService();
		const before = getTracerSpy.mock.calls.length;
		service.initialize({
			appName: "ver",
			appVersion: "3.2.1",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		const after = getTracerSpy.mock.calls.slice(before);
		expect(after.some((c) => c[0] === "iqai-adk" && c[1] === "3.2.1")).toBe(
			true,
		);
	});

	it("initialize defaults tracer version to 0.1.0 when appVersion omitted", () => {
		const service = new TelemetryService();
		const before = getTracerSpy.mock.calls.length;
		service.initialize({
			appName: "ver",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		const after = getTracerSpy.mock.calls.slice(before);
		expect(after.some((c) => c[0] === "iqai-adk" && c[1] === "0.1.0")).toBe(
			true,
		);
	});

	it("traceLlmCall coalesces usage token nullish to 0", async () => {
		const setAttributes = vi.fn();
		const addEvent = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent,
		} as any);

		const service = new TelemetryService();
		service.traceLlmCall(
			{ invocationId: "i", userId: "u", session: { id: "s" } } as any,
			"e",
			{ model: "m", config: {}, contents: [] } as LlmRequest,
			{
				content: { role: "model", parts: [{ text: "x" }] },
				usageMetadata: {
					promptTokenCount: null,
					candidatesTokenCount: undefined,
				},
			} as LlmResponse,
		);

		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]).toMatchObject({
			"gen_ai.usage.input_tokens": 0,
			"gen_ai.usage.output_tokens": 0,
		});
	});

	it.each([
		{ label: "0", prompt: 0, candidates: 0 },
		{
			label: "falsey empty string coerced",
			prompt: "" as any,
			candidates: "" as any,
		},
	])("traceLlmCall usageMetadata $label coalesces via || 0", async ({
		prompt,
		candidates,
	}) => {
		const setAttributes = vi.fn();
		const addEvent = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent,
		} as any);

		const service = new TelemetryService();
		service.traceLlmCall(
			{ invocationId: "i", userId: "u", session: { id: "s" } } as any,
			"e",
			{ model: "m", config: {}, contents: [] } as LlmRequest,
			{
				usageMetadata: {
					promptTokenCount: prompt,
					candidatesTokenCount: candidates,
				},
			} as LlmResponse,
		);

		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(0);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(0);
	});

	it("traceLlmCall preserves non-zero usage tokens", async () => {
		const setAttributes = vi.fn();
		const addEvent = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent,
		} as any);

		const service = new TelemetryService();
		service.traceLlmCall(
			{ invocationId: "i", userId: "u", session: { id: "s" } } as any,
			"e",
			{ model: "m", config: {}, contents: [] } as LlmRequest,
			{
				usageMetadata: {
					promptTokenCount: 11,
					candidatesTokenCount: 22,
				},
			} as LlmResponse,
		);

		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]).toMatchObject({
			"gen_ai.usage.input_tokens": 11,
			"gen_ai.usage.output_tokens": 22,
		});
	});
});
