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
		trace: {
			...actual.trace,
			getTracer: getTracerSpy,
		},
		diag: {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			verbose: vi.fn(),
			setLogger: vi.fn(),
		},
	};
});

/**
 * Tenth leftover: `config.appVersion || "0.1.0"` — falsy values default;
 * whitespace-only is truthy and kept. Distinct from sixth omit-only coverage.
 */
describe("Telemetry appVersion || default tenth leftover (post #176)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "empty string", appVersion: "" },
		{ label: "null", appVersion: null as any },
		{ label: "undefined explicit", appVersion: undefined },
		{ label: "0", appVersion: 0 as any },
		{ label: "false", appVersion: false as any },
		{ label: "NaN", appVersion: Number.NaN as any },
	])("appVersion $label coalesces to 0.1.0 via ||", ({ appVersion }) => {
		const service = new TelemetryService();
		const before = getTracerSpy.mock.calls.length;
		service.initialize({
			appName: "appver-falsy",
			appVersion,
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		const after = getTracerSpy.mock.calls.slice(before);
		expect(after.some((c) => c[0] === "iqai-adk" && c[1] === "0.1.0")).toBe(
			true,
		);
	});

	it.each([
		" ",
		"\t",
		"  1.2.3  ",
		"0.0.0",
	] as const)("truthy appVersion %j is kept (whitespace / zero-looking string)", (appVersion) => {
		const service = new TelemetryService();
		const before = getTracerSpy.mock.calls.length;
		service.initialize({
			appName: "appver-truthy",
			appVersion,
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		const after = getTracerSpy.mock.calls.slice(before);
		expect(after.some((c) => c[0] === "iqai-adk" && c[1] === appVersion)).toBe(
			true,
		);
	});
});
