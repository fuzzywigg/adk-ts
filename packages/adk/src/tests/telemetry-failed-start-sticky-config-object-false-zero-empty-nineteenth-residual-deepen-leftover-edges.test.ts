import { afterEach, describe, expect, it, vi } from "vitest";
import { TelemetryService } from "../telemetry";

const { startMock, shutdownMock, NodeSDKMock, diagWarn, diagError } =
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

vi.mock("@opentelemetry/api", async () => {
	const actual =
		await vi.importActual<typeof import("@opentelemetry/api")>(
			"@opentelemetry/api",
		);
	return {
		...actual,
		diag: {
			warn: diagWarn,
			error: diagError,
			debug: vi.fn(),
			setLogger: vi.fn(),
			verbose: vi.fn(),
			info: vi.fn(),
		},
	};
});

afterEach(() => {
	vi.clearAllMocks();
	startMock.mockReset();
	shutdownMock.mockReset().mockResolvedValue(undefined);
	NodeSDKMock.mockClear();
	diagWarn.mockReset();
	diagError.mockReset();
});

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668 (eighteenth
 * sticky-config niche): failed-start sticky config preserves boxed-falsy /
 * `"-Infinity"` / `-1` appVersion.
 */
describe("telemetry failed-start sticky config object-false/zero/empty nineteenth residual deepen", () => {
	it.each([
		{ label: "Object(false)", appVersion: Object(false) as any },
		{ label: "Object(0)", appVersion: Object(0) as any },
		{ label: 'Object("")', appVersion: Object("") as any },
		{ label: "Object(NaN)", appVersion: Object(Number.NaN) as any },
		{ label: 'string "-Infinity"', appVersion: "-Infinity" as any },
		{ label: "number -1", appVersion: -1 as any },
	])("failed-start sticky config preserves residual appVersion ($label)", ({
		appVersion,
	}) => {
		startMock.mockImplementationOnce(() => {
			throw new Error("start boom");
		});
		const service = new TelemetryService();
		expect(() =>
			service.initialize({
				appName: "fail-config",
				otlpEndpoint: "http://localhost:4318/v1/traces",
				appVersion,
			}),
		).toThrow(/start boom/);
		expect(service.initialized).toBe(false);
		expect(service.getConfig()?.appVersion).toBe(appVersion);
	});
});
