import { afterEach, describe, expect, it, vi } from "vitest";
import { TelemetryService } from "../telemetry";

const { startMock, shutdownMock, NodeSDKMock, getNodeAutoInstrumentations } =
	vi.hoisted(() => {
		const startMock = vi.fn();
		const shutdownMock = vi.fn().mockResolvedValue(undefined);
		const NodeSDKMock = vi.fn(function NodeSDK(this: any) {
			this.start = startMock;
			this.shutdown = shutdownMock;
		});
		const getNodeAutoInstrumentations = vi.fn(() => []);
		return {
			startMock,
			shutdownMock,
			NodeSDKMock,
			getNodeAutoInstrumentations,
		};
	});

vi.mock("@opentelemetry/sdk-node", () => ({
	NodeSDK: NodeSDKMock,
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
	OTLPTraceExporter: vi.fn(),
}));

vi.mock("@opentelemetry/auto-instrumentations-node", () => ({
	getNodeAutoInstrumentations,
}));

vi.mock("@opentelemetry/resources", () => ({
	resourceFromAttributes: vi.fn((attrs) => attrs),
}));

afterEach(() => {
	vi.clearAllMocks();
	startMock.mockReset();
	shutdownMock.mockReset().mockResolvedValue(undefined);
	NodeSDKMock.mockClear();
	getNodeAutoInstrumentations.mockClear();
});

/**
 * Leftover: ignoreIncomingRequestHook always returns true for any req shape.
 */
describe("telemetry ignoreIncomingRequestHook leftover edges", () => {
	function extractHook() {
		const service = new TelemetryService();
		service.initialize({
			appName: "hook-app",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		expect(getNodeAutoInstrumentations).toHaveBeenCalled();
		const cfg = getNodeAutoInstrumentations.mock.calls[0][0];
		return cfg["@opentelemetry/instrumentation-http"]
			.ignoreIncomingRequestHook as (req: any) => boolean;
	}

	it.each([
		{ label: "empty object", req: {} },
		{ label: "url only", req: { url: "/health" } },
		{ label: "POST", req: { method: "POST", url: "/v1" } },
		{ label: "GET with headers", req: { method: "GET", headers: {} } },
		{ label: "null", req: null },
		{ label: "undefined", req: undefined },
		{ label: "string", req: "req" },
		{ label: "number", req: 0 },
	])("hook always ignores ($label)", ({ req }) => {
		const hook = extractHook();
		expect(hook(req)).toBe(true);
	});

	it("hook is stable across multiple initialize configs on fresh services", () => {
		const hookA = extractHook();
		getNodeAutoInstrumentations.mockClear();
		const hookB = extractHook();
		expect(hookA({})).toBe(true);
		expect(hookB({ method: "DELETE" })).toBe(true);
	});
});
