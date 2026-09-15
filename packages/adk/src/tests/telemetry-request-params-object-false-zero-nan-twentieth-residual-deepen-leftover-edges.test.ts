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
 * Twentieth leftover residual deepen (complements #282 object-true/one/infinity):
 * request-param `|| 0` — boxed falsy `Object(false)` / `Object(0)` /
 * `Object(NaN)` stay (unlike primitive false/0/NaN coalesce).
 */
describe("telemetry request-params object-false/zero/nan twentieth residual deepen", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;

	it.each([
		{ label: "Object(false)", value: Object(false) },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
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
