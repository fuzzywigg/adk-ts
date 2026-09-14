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
 * Tenth leftover: config.appVersion || "0.1.0" — omitted is covered; falsy matrix is not.
 */
describe("telemetry appVersion falsy-or-default tenth leftover edges", () => {
	it.each([
		{ label: "empty string", appVersion: "" },
		{ label: "null", appVersion: null as any },
		{ label: "0", appVersion: 0 as any },
		{ label: "false", appVersion: false as any },
	])("initialize coalesces falsy appVersion ($label) → 0.1.0", ({
		appVersion,
	}) => {
		const service = new TelemetryService();
		const before = getTracerSpy.mock.calls.length;
		service.initialize({
			appName: "app-ver",
			appVersion,
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		const after = getTracerSpy.mock.calls.slice(before);
		expect(after.some((c) => c[0] === "iqai-adk" && c[1] === "0.1.0")).toBe(
			true,
		);
	});

	it("initialize keeps truthy appVersion on tracer", () => {
		const service = new TelemetryService();
		const before = getTracerSpy.mock.calls.length;
		service.initialize({
			appName: "app-ver",
			appVersion: "2.0.0",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		const after = getTracerSpy.mock.calls.slice(before);
		expect(after.some((c) => c[0] === "iqai-adk" && c[1] === "2.0.0")).toBe(
			true,
		);
	});

	it.each([
		{ label: "single space", appVersion: " " },
		{ label: "zero string", appVersion: "0" },
		{ label: "false string", appVersion: "false" },
	])("initialize keeps truthy-but-odd appVersion ($label) (no || default)", ({
		appVersion,
	}) => {
		const service = new TelemetryService();
		const before = getTracerSpy.mock.calls.length;
		service.initialize({
			appName: "app-ver",
			appVersion,
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		const after = getTracerSpy.mock.calls.slice(before);
		expect(after.some((c) => c[0] === "iqai-adk" && c[1] === appVersion)).toBe(
			true,
		);
	});
});
