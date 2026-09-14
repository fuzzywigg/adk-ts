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
 * Seventeenth leftover: `this.sdk = new NodeSDK(...)` runs before `start()`.
 * On start throw, `isInitialized` stays false but `sdk` remains assigned —
 * opposite of shutdown-timeout sticky-init leftover.
 */
describe("telemetry failed-start sticky sdk seventeenth leftover edges", () => {
	it("start throw leaves initialized false while sdk stays assigned", () => {
		startMock.mockImplementationOnce(() => {
			throw new Error("start boom");
		});
		const service = new TelemetryService();
		expect(() =>
			service.initialize({
				appName: "fail-start",
				otlpEndpoint: "http://localhost:4318/v1/traces",
			}),
		).toThrow(/start boom/);
		expect(service.initialized).toBe(false);
		expect(NodeSDKMock).toHaveBeenCalledTimes(1);
		expect(diagError).toHaveBeenCalled();
	});

	it("shutdown early-returns on failed-start sticky sdk because initialized is false", async () => {
		startMock.mockImplementationOnce(() => {
			throw new Error("start boom");
		});
		const service = new TelemetryService();
		expect(() =>
			service.initialize({
				appName: "fail-start",
				otlpEndpoint: "http://localhost:4318/v1/traces",
			}),
		).toThrow(/start boom/);

		await service.shutdown();
		expect(shutdownMock).not.toHaveBeenCalled();
		expect(diagWarn).toHaveBeenCalledWith(
			"Telemetry is not initialized or already shut down.",
		);
		expect(service.initialized).toBe(false);
	});

	it("second initialize after failed start replaces sdk and can succeed", () => {
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

		startMock.mockImplementationOnce(() => undefined);
		service.initialize({
			appName: "second",
			otlpEndpoint: "http://localhost:9999/v1/traces",
		});
		expect(service.initialized).toBe(true);
		expect(NodeSDKMock).toHaveBeenCalledTimes(2);
		expect(service.getConfig()?.appName).toBe("second");
	});
});
