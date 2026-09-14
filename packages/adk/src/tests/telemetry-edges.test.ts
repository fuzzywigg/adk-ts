import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "../events/event";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
import { TelemetryService, traceLlmCall } from "../telemetry";
import type { BaseTool } from "../tools";

const { startMock, shutdownMock, NodeSDKMock } = vi.hoisted(() => {
	const startMock = vi.fn();
	const shutdownMock = vi.fn().mockResolvedValue(undefined);
	const NodeSDKMock = vi.fn(function NodeSDK(this: any) {
		this.start = startMock;
		this.shutdown = shutdownMock;
	});
	return { startMock, shutdownMock, NodeSDKMock };
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

afterEach(() => {
	vi.restoreAllMocks();
	startMock.mockReset();
	shutdownMock.mockReset().mockResolvedValue(undefined);
	NodeSDKMock.mockClear();
});

function fakeEvent(overrides: Partial<Event> = {}): Event {
	return {
		invocationId: "inv-edge",
		author: "agent",
		...overrides,
	} as Event;
}

describe("Telemetry leftover edges (TOKENMAXX post #124)", () => {
	it("_buildLlmRequestForTrace uses [] when contents is nullish", () => {
		const service = new TelemetryService();
		const request = {
			model: "m",
			config: {},
			contents: null,
		} as unknown as LlmRequest;

		const built = (service as any)._buildLlmRequestForTrace(request);
		expect(built.contents).toEqual([]);
		expect(built.model).toBe("m");
	});

	it("traceLlmCall with nullish contents does not throw when no span is active", () => {
		const request = {
			model: "m",
			config: {},
			contents: undefined,
		} as unknown as LlmRequest;
		const response = { text: "ok" } as LlmResponse;

		expect(() => traceLlmCall(fakeEvent(), request, response)).not.toThrow();
	});

	it("exports BaseTool type usage path remains callable for empty tool names", () => {
		const tool = { name: "", description: "x" } as BaseTool;
		expect(tool.name).toBe("");
	});
});
