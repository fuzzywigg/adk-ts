import { ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TelemetryService } from "../telemetry";

const {
	startMock,
	shutdownMock,
	NodeSDKMock,
	getTracerSpy,
	resourceFromAttributes,
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
		resourceFromAttributes: vi.fn((attrs: Record<string, unknown>) => attrs),
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
	resourceFromAttributes,
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
	resourceFromAttributes.mockClear().mockImplementation((attrs) => attrs);
});

/**
 * Fifteenth leftover: resource stores raw `config.appVersion` while tracer uses
 * `config.appVersion || "0.1.0"`. Tenth leftover only pinned the tracer path.
 */
describe("telemetry appVersion resource vs tracer asymmetry fifteenth leftover edges", () => {
	it.each([
		{ label: "empty string", appVersion: "" },
		{ label: "0", appVersion: 0 as any },
		{ label: "false", appVersion: false as any },
	])("resource keeps falsy $label while tracer defaults to 0.1.0", ({
		appVersion,
	}) => {
		const service = new TelemetryService();
		const before = getTracerSpy.mock.calls.length;
		service.initialize({
			appName: "asym-app",
			appVersion,
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		expect(resourceFromAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				[ATTR_SERVICE_VERSION]: appVersion,
			}),
		);
		const after = getTracerSpy.mock.calls.slice(before);
		expect(after.some((c) => c[0] === "iqai-adk" && c[1] === "0.1.0")).toBe(
			true,
		);
	});

	it.each([
		{ label: "whitespace", appVersion: " " },
		{ label: "zero string", appVersion: "0" },
	])("resource and tracer both keep truthy $label", ({ appVersion }) => {
		const service = new TelemetryService();
		const before = getTracerSpy.mock.calls.length;
		service.initialize({
			appName: "asym-app",
			appVersion,
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		expect(resourceFromAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				[ATTR_SERVICE_VERSION]: appVersion,
			}),
		);
		const after = getTracerSpy.mock.calls.slice(before);
		expect(after.some((c) => c[0] === "iqai-adk" && c[1] === appVersion)).toBe(
			true,
		);
	});
});
