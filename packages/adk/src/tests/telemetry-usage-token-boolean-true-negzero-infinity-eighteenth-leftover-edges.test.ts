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
 * Eighteenth leftover: usage token-field `|| 0` residual after fourteenth
 * whitespace / `"0"` / `"false"` / NaN. Boolean `true` / string `"true"` /
 * `[]` / `NEGATIVE_INFINITY` stay; `-0` SameValueZero-collapses to `0`.
 */
describe("telemetry usage-token boolean-true negzero infinity eighteenth leftover edges", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;

	it.each([
		{ label: "boolean true", value: true },
		{ label: "string true", value: "true" },
		{ label: "empty array", value: [] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("keeps truthy near-miss $label token counts", async ({ value }) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"e1",
			{ model: "m", config: {}, contents: [] } as LlmRequest,
			{
				usageMetadata: {
					promptTokenCount: value,
					candidatesTokenCount: value,
				},
			} as LlmResponse,
		);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(value);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(value);
	});

	it("-0 SameValueZero-collapses via || 0 on token counts", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"e1",
			{ model: "m", config: {}, contents: [] } as LlmRequest,
			{
				usageMetadata: {
					promptTokenCount: -0,
					candidatesTokenCount: -0,
				},
			} as LlmResponse,
		);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(0);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(0);
		expect(Object.is(usageCall?.[0]["gen_ai.usage.input_tokens"], -0)).toBe(
			false,
		);
	});
});
