import { ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TelemetryService } from "../telemetry";

const {
	startMock,
	shutdownMock,
	NodeSDKMock,
	getTracerSpy,
	resourceFromAttributesMock,
} = vi.hoisted(() => {
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
		resourceFromAttributesMock: vi.fn((attrs: any) => attrs),
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
	resourceFromAttributes: resourceFromAttributesMock,
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
	resourceFromAttributesMock.mockClear().mockImplementation((attrs) => attrs);
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

	/**
	 * Residual: resource ATTR_SERVICE_VERSION keeps falsy appVersion as-is,
	 * while getTracer still coalesces via || "0.1.0".
	 */
	it.each([
		{ label: "empty string", appVersion: "" },
		{ label: "null", appVersion: null as any },
		{ label: "0", appVersion: 0 as any },
		{ label: "false", appVersion: false as any },
	])("resource keeps falsy appVersion ($label) while tracer defaults", ({
		appVersion,
	}) => {
		const service = new TelemetryService();
		const resourceBefore = resourceFromAttributesMock.mock.calls.length;
		const tracerBefore = getTracerSpy.mock.calls.length;
		service.initialize({
			appName: "app-ver-asym",
			appVersion,
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		const resourceAttrs =
			resourceFromAttributesMock.mock.calls[resourceBefore][0];
		expect(resourceAttrs[ATTR_SERVICE_VERSION]).toBe(appVersion);
		const tracerAfter = getTracerSpy.mock.calls.slice(tracerBefore);
		expect(
			tracerAfter.some((c) => c[0] === "iqai-adk" && c[1] === "0.1.0"),
		).toBe(true);
	});

	it("resource and tracer both keep truthy appVersion", () => {
		const service = new TelemetryService();
		const resourceBefore = resourceFromAttributesMock.mock.calls.length;
		const tracerBefore = getTracerSpy.mock.calls.length;
		service.initialize({
			appName: "app-ver-asym",
			appVersion: "2.0.0",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		expect(
			resourceFromAttributesMock.mock.calls[resourceBefore][0][
				ATTR_SERVICE_VERSION
			],
		).toBe("2.0.0");
		expect(
			getTracerSpy.mock.calls
				.slice(tracerBefore)
				.some((c) => c[0] === "iqai-adk" && c[1] === "2.0.0"),
		).toBe(true);
	});
});
