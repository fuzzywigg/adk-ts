import { afterEach, describe, expect, it, vi } from "vitest";
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
 * Twentieth leftover residual deepen (complements #282 object-true/one/infinity):
 * `appVersion || "0.1.0"` — boxed falsy `Object(false)` / `Object(0)` /
 * `Object(NaN)` stay truthy and keep.
 */
describe("telemetry appVersion object-false/zero/nan twentieth residual deepen", () => {
	it.each([
		{ label: "Object(false)", value: Object(false) },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("$label stays on tracer version", ({ value }) => {
		const service = new TelemetryService();
		const before = getTracerSpy.mock.calls.length;
		service.initialize({
			appName: "app-ver",
			appVersion: value as any,
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		const after = getTracerSpy.mock.calls.slice(before);
		expect(after.some((c) => c[0] === "iqai-adk" && c[1] === value)).toBe(true);
	});
});
