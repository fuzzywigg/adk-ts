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
 * Fourteenth leftover: usageMetadata token fields use `|| 0`.
 * Sixth leftover pinned nullish / 0 / ""; truthy whitespace / "0" stay, while
 * false / NaN still coalesce to 0.
 */
describe("telemetry usage-token whitespace truthy fourteenth leftover edges", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;

	it.each([
		{ label: "space", value: " ", expected: " " },
		{ label: "zero string", value: "0", expected: "0" },
		{ label: "false string", value: "false", expected: "false" },
	])("keeps truthy $label token counts (no || 0)", async ({
		value,
		expected,
	}) => {
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
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(expected);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(expected);
	});

	it.each([
		{ label: "false", value: false },
		{ label: "NaN", value: Number.NaN },
	])("coalesces falsy $label token counts via || 0", async ({ value }) => {
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
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(0);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(0);
	});
});
