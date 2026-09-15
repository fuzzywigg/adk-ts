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
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `if (usageMetadata)` — boxed-falsy / `"-Infinity"` / `-1` enter;
 * missing token props coalesce via `|| 0`.
 */
describe("telemetry usageMetadata gate object-false/zero/empty nineteenth residual deepen", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;

	it.each([
		{ label: "Object(false)", value: Object(false) },
		{ label: "Object(0)", value: Object(0) },
		{ label: 'Object("")', value: Object("") },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "number -1", value: -1 },
	])("truthy residual usageMetadata ($label) enters token || 0 arm", async ({
		value,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"e1",
			{ model: "m", config: {}, contents: [] } as LlmRequest,
			{ usageMetadata: value as any } as LlmResponse,
		);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(0);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(0);
	});
});
