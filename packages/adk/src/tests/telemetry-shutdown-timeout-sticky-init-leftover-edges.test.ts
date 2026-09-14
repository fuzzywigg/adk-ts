import { afterEach, describe, expect, it, vi } from "vitest";
import { TelemetryService } from "../telemetry";

const { startMock, shutdownMock, NodeSDKMock, diagWarn } = vi.hoisted(() => {
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
			error: vi.fn(),
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
});

/**
 * Leftover: on shutdown timeout, isInitialized stays true while finally nulls sdk.
 * Follow-on initialize skips; follow-on shutdown hits !sdk early path.
 */
describe("telemetry shutdown timeout sticky-init leftover edges", () => {
	it("timeout leaves initialized sticky and clears sdk via finally", async () => {
		const service = new TelemetryService();
		shutdownMock.mockImplementationOnce(() => new Promise(() => {}));
		service.initialize({
			appName: "sticky-app",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});

		await expect(service.shutdown(15)).rejects.toThrow(/timeout/);
		expect(service.initialized).toBe(true);
		expect(diagWarn).toHaveBeenCalledWith(expect.stringContaining("timed out"));
	});

	it("second initialize no-ops after sticky timeout because initialized remains true", async () => {
		const service = new TelemetryService();
		shutdownMock.mockImplementationOnce(() => new Promise(() => {}));
		service.initialize({
			appName: "first",
			otlpEndpoint: "http://localhost:4318/v1/traces",
			appVersion: "1.0.0",
		});
		await expect(service.shutdown(10)).rejects.toThrow(/timeout/);

		const sdkCallsBefore = NodeSDKMock.mock.calls.length;
		service.initialize({
			appName: "second",
			otlpEndpoint: "http://localhost:9999/v1/traces",
		});
		expect(NodeSDKMock.mock.calls.length).toBe(sdkCallsBefore);
		expect(diagWarn).toHaveBeenCalledWith(
			"Telemetry is already initialized. Skipping.",
		);
		expect(service.getConfig()?.appName).toBe("first");
	});

	it("second shutdown after sticky timeout warns via !sdk path without calling SDK", async () => {
		const service = new TelemetryService();
		shutdownMock.mockImplementationOnce(() => new Promise(() => {}));
		service.initialize({
			appName: "sticky",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		await expect(service.shutdown(10)).rejects.toThrow(/timeout/);

		shutdownMock.mockClear();
		diagWarn.mockClear();
		await service.shutdown(5);
		expect(shutdownMock).not.toHaveBeenCalled();
		expect(diagWarn).toHaveBeenCalledWith(
			"Telemetry is not initialized or already shut down.",
		);
		expect(service.initialized).toBe(true);
	});

	it("successful shutdown still clears sticky flag unlike timeout path", async () => {
		const service = new TelemetryService();
		service.initialize({
			appName: "ok",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		await service.shutdown();
		expect(service.initialized).toBe(false);

		service.initialize({
			appName: "reinit",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		expect(service.initialized).toBe(true);
		expect(service.getConfig()?.appName).toBe("reinit");
	});
});
