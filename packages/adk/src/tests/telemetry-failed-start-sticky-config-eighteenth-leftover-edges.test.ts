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
 * Eighteenth leftover (HEAVY tip-relaunch residual after #236):
 * `this.config = config` runs before `start()`. On start throw, `initialized`
 * stays false but `getConfig()` still holds the failed attempt — including
 * truthy near-miss `appVersion` values — sibling of seventeenth failed-start
 * sticky sdk leftover.
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

	it.each([
		{ label: "boolean true", appVersion: true as any },
		{ label: "string true", appVersion: "true" as any },
		{ label: "empty array", appVersion: [] as any },
		{ label: "NEGATIVE_INFINITY", appVersion: Number.NEGATIVE_INFINITY as any },
		{ label: "-0", appVersion: -0 as any },
	])("failed-start sticky config preserves truthy/near-miss appVersion ($label)", ({
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
		if (Object.is(appVersion, -0)) {
			expect(Object.is(service.getConfig()?.appVersion, -0)).toBe(true);
		}
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
				appVersion: true as any,
			}),
		).toThrow(/start boom/);
		expect(service.getConfig()?.appName).toBe("first");
		expect(service.getConfig()?.appVersion).toBe(true);

		startMock.mockImplementationOnce(() => undefined);
		service.initialize({
			appName: "second",
			otlpEndpoint: "http://localhost:9999/v1/traces",
			appVersion: "true" as any,
		});
		expect(service.initialized).toBe(true);
		expect(service.getConfig()?.appName).toBe("second");
		expect(service.getConfig()?.otlpEndpoint).toBe(
			"http://localhost:9999/v1/traces",
		);
		expect(service.getConfig()?.appVersion).toBe("true");
	});
});
