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
 * Nineteenth leftover residual deepen (complements #269 NaN/posinf):
 * request-param `|| 0` — `Object(true)` / `1` / `"Infinity"` / `{}` all truthy
 * so stay (unlike NaN coalesce).
 */
describe("telemetry request-params object-true/one/infinity nineteenth residual deepen", () => {
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
	])("$label stays on all three request params via ||", async ({ value }) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"e1",
			{
				model: "m",
				config: {
					maxOutputTokens: value as any,
					temperature: value as any,
					topP: value as any,
				},
				contents: [],
			} as LlmRequest,
			{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.request.max_tokens"]).toBe(value);
		expect(attrs["gen_ai.request.temperature"]).toBe(value);
		expect(attrs["gen_ai.request.top_p"]).toBe(value);
	});
});
