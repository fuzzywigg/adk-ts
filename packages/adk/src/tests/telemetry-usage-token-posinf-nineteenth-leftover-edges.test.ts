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
 * usage token `|| 0` after fourteenth NaN coalesce and eighteenth
 * true/`"true"`/`[]`/`-Infinity`/`-0`. `POSITIVE_INFINITY` stays.
 */
describe("telemetry usage-token posinf nineteenth leftover edges", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;

	it("POSITIVE_INFINITY token counts stay (sibling of -Infinity eighteenth)", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"e1",
			{ model: "m", config: {}, contents: [] } as LlmRequest,
			{
				usageMetadata: {
					promptTokenCount: Number.POSITIVE_INFINITY,
					candidatesTokenCount: Number.POSITIVE_INFINITY,
				},
			} as LlmResponse,
		);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(
			Number.POSITIVE_INFINITY,
		);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(
			Number.POSITIVE_INFINITY,
		);
	});
});
