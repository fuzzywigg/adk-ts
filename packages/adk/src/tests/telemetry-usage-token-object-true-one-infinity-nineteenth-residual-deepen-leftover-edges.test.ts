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
 * Nineteenth leftover residual deepen (complements #269 posinf keep):
 * usage token `|| 0` — `Object(true)` / `1` / `"Infinity"` / `{}` stay.
 */
describe("telemetry usage-token object-true/one/infinity nineteenth residual deepen", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;

	it.each([
		{ label: "Object(true)", value: Object(true) },
		{ label: "number 1", value: 1 },
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "empty object", value: {} },
	])("$label token counts stay via || 0", async ({ value }) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"e1",
			{ model: "m", config: {}, contents: [] } as LlmRequest,
			{
				usageMetadata: {
					promptTokenCount: value as any,
					candidatesTokenCount: value as any,
				},
			} as LlmResponse,
		);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(value);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(value);
	});
});
