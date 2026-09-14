import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("TelemetryService matrix edges (TOKENMAXX leftovers)", () => {
	it.each([
		{ label: "undefined contents", contents: undefined },
		{ label: "null contents", contents: null },
	])("_buildLlmRequestForTrace coalesces $label to an empty contents list", ({
		contents,
	}) => {
		const service = new TelemetryService();
		const built = (service as any)._buildLlmRequestForTrace({
			model: "m",
			config: { temperature: 0.2 },
			contents,
		} as LlmRequest);

		expect(built).toEqual({
			model: "m",
			config: { temperature: 0.2 },
			contents: [],
		});
	});
});
