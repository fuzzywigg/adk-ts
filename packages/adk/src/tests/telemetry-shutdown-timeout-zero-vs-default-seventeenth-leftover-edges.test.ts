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
 * Seventeenth leftover: `shutdown(timeoutMs = 5000)` — explicit `0` bypasses
 * default (immediate timeout race); omitted/`undefined` keep 5000. Sticky-init
 * leftover covers timeout aftermath, not default-param falsy `0`.
 */
describe("telemetry shutdown timeout zero vs default seventeenth leftover edges", () => {
	function initService() {
		const service = new TelemetryService();
		service.initialize({
			appName: "shutdown-app",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		return service;
	}

	it("shutdown() with no arg uses default 5000 and awaits sdk.shutdown", async () => {
		const service = initService();
		let resolveShutdown!: () => void;
		shutdownMock.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveShutdown = resolve;
				}),
		);
		const pending = service.shutdown();
		resolveShutdown();
		await pending;
		expect(shutdownMock).toHaveBeenCalledTimes(1);
		expect(service.initialized).toBe(false);
	});

	it("shutdown(undefined) still uses default 5000", async () => {
		const service = initService();
		await service.shutdown(undefined);
		expect(shutdownMock).toHaveBeenCalledTimes(1);
		expect(service.initialized).toBe(false);
	});

	it("shutdown(0) races with immediate timeout and rejects", async () => {
		const service = initService();
		shutdownMock.mockImplementationOnce(() => new Promise(() => {}));
		await expect(service.shutdown(0)).rejects.toThrow(/timeout after 0ms/);
		expect(diagWarn).toHaveBeenCalledWith(expect.stringContaining("timed out"));
	});

	it('shutdown("0") treats string as truthy timer delay (not default)', async () => {
		const service = initService();
		shutdownMock.mockImplementationOnce(() => new Promise(() => {}));
		const pending = service.shutdown("0" as any);
		await expect(pending).rejects.toThrow(/timeout after 0ms/);
	});
});
