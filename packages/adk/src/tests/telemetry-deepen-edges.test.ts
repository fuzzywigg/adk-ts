import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "../events/event";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
import { TelemetryService } from "../telemetry";
import type { BaseTool } from "../tools";

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

describe("TelemetryService deepen edges (TOKENMAXX remainder)", () => {
	it("initialize stores full config including environment and headers", () => {
		const service = new TelemetryService();
		service.initialize({
			appName: "deepen-app",
			appVersion: "9.9.9",
			otlpEndpoint: "http://localhost:4318/v1/traces",
			otlpHeaders: { Authorization: "Bearer x" },
			environment: "test",
		});

		expect(service.initialized).toBe(true);
		expect(service.getConfig()).toMatchObject({
			appName: "deepen-app",
			appVersion: "9.9.9",
			environment: "test",
			otlpHeaders: { Authorization: "Bearer x" },
		});
		expect(NodeSDKMock).toHaveBeenCalledOnce();
		expect(startMock).toHaveBeenCalledOnce();
	});

	it("second initialize warns and keeps the first config", () => {
		const service = new TelemetryService();
		service.initialize({
			appName: "first",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		service.initialize({
			appName: "second",
			otlpEndpoint: "http://other:4318/v1/traces",
		});

		expect(service.getConfig()?.appName).toBe("first");
		expect(diagWarn).toHaveBeenCalledWith(
			"Telemetry is already initialized. Skipping.",
		);
		expect(NodeSDKMock).toHaveBeenCalledOnce();
	});

	it("shutdown no-ops with warn when never initialized", async () => {
		const service = new TelemetryService();
		await service.shutdown(10);
		expect(diagWarn).toHaveBeenCalled();
		expect(shutdownMock).not.toHaveBeenCalled();
	});

	it("trace helpers are safe with empty payloads when no span is active", () => {
		const service = new TelemetryService();
		const tool = { name: "t" } as BaseTool;
		const event = { invocationId: "i", author: "a" } as Event;
		expect(() =>
			service.traceToolCall({} as any, tool, {}, event),
		).not.toThrow();
		expect(() =>
			service.traceLlmCall(
				{} as any,
				{ model: "m", contents: [] } as LlmRequest,
				{ content: { parts: [] } } as LlmResponse,
			),
		).not.toThrow();
	});

	it("shutdown after initialize clears initialized flag", async () => {
		const service = new TelemetryService();
		service.initialize({
			appName: "shutdown-deepen",
			otlpEndpoint: "http://localhost:4318/v1/traces",
		});
		await service.shutdown(1000);
		expect(service.initialized).toBe(false);
		expect(shutdownMock).toHaveBeenCalledOnce();
	});

	it("getTracer remains usable before initialize", () => {
		const service = new TelemetryService();
		expect(service.getTracer()).toBeTruthy();
		expect(service.getConfig()).toBeNull();
		expect(service.initialized).toBe(false);
	});
});
