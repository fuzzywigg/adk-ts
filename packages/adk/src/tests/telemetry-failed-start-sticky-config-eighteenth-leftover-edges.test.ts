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
 * Eighteenth leftover: `this.config = config` runs before `start()`. On start
 * throw, `initialized` stays false but `getConfig()` still holds the failed
 * attempt — sibling of seventeenth failed-start sticky sdk leftover.
 */
describe("telemetry failed-start sticky config eighteenth leftover edges", () => {
	it("start throw leaves initialized false while config stays assigned", () => {
		startMock.mockImplementationOnce(() => {
			throw new Error("start boom");
		});
		const service = new TelemetryService();
		expect(() =>
			service.initialize({
				appName: "fail-config",
				otlpEndpoint: "http://localhost:4318/v1/traces",
			}),
		).toThrow(/start boom/);
		expect(service.initialized).toBe(false);
		expect(service.getConfig()?.appName).toBe("fail-config");
		expect(service.getConfig()?.otlpEndpoint).toBe(
			"http://localhost:4318/v1/traces",
		);
	});

	it("second initialize after failed start overwrites sticky config", () => {
		startMock.mockImplementationOnce(() => {
			throw new Error("start boom");
		});
		const service = new TelemetryService();
		expect(() =>
			service.initialize({
				appName: "first",
				otlpEndpoint: "http://localhost:4318/v1/traces",
			}),
		).toThrow(/start boom/);
		expect(service.getConfig()?.appName).toBe("first");

		startMock.mockImplementationOnce(() => undefined);
		service.initialize({
			appName: "second",
			otlpEndpoint: "http://localhost:9999/v1/traces",
		});
		expect(service.initialized).toBe(true);
		expect(service.getConfig()?.appName).toBe("second");
		expect(service.getConfig()?.otlpEndpoint).toBe(
			"http://localhost:9999/v1/traces",
		);
	});
});
