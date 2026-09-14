import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
import { TelemetryService } from "../telemetry";

afterEach(() => {
	vi.restoreAllMocks();
});

async function withActiveSpan() {
	const setAttributes = vi.fn();
	const { trace } = await import("@opentelemetry/api");
	vi.spyOn(trace, "getActiveSpan").mockReturnValue({
		setAttributes,
		addEvent: vi.fn(),
	} as any);
	return { setAttributes };
}

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip 96457a9 / #248):
 * `if (llmResponse.usageMetadata)` after seventeenth falsy skip + true/`"0"`/
 * `{}`. `-0`/`NaN` skip; `"true"`/`[]`/`±Infinity` enter and emit 0 tokens.
 */
describe("telemetry usageMetadata gate negzero nan string-true posinf nineteenth leftover edges", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;
	const request = { model: "m", config: {}, contents: [] } as LlmRequest;

	it.each([
		{ label: "-0", usageMetadata: -0 },
		{ label: "NaN", usageMetadata: Number.NaN },
	])("skips usage attrs when usageMetadata is falsy near-miss ($label)", async ({
		usageMetadata,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			usageMetadata,
		} as LlmResponse);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall).toBeUndefined();
	});

	it.each([
		{ label: "string true", usageMetadata: "true" },
		{ label: "empty array", usageMetadata: [] },
		{ label: "POSITIVE_INFINITY", usageMetadata: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", usageMetadata: Number.NEGATIVE_INFINITY },
	])("truthy near-miss $label enters gate and emits usage attrs as 0", async ({
		usageMetadata,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			usageMetadata,
		} as LlmResponse);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(0);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(0);
	});
});
