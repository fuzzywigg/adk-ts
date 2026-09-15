import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
import { TelemetryService } from "../telemetry";

afterEach(() => {
	vi.restoreAllMocks();
});

async function withActiveSpan() {
	const setAttributes = vi.fn();
	const addEvent = vi.fn();
	const { trace } = await import("@opentelemetry/api");
	vi.spyOn(trace, "getActiveSpan").mockReturnValue({
		setAttributes,
		addEvent,
	} as any);
	return { setAttributes, addEvent };
}

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668 (eighteenth
 * prompt/messages niche): prompt stays bare undefined while completion keeps
 * boxed-falsy / `"-Infinity"` / `-1` stringify asymmetries.
 */
describe("telemetry prompt messages object-false/zero/empty nineteenth residual deepen", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;

	const request = {
		model: "m",
		config: {},
		contents: [{ role: "user", parts: [{ text: "hi" }] }],
	} as LlmRequest;

	it.each([
		{ label: "Object(false)", content: Object(false), expectedJson: "false" },
		{ label: "Object(0)", content: Object(0), expectedJson: "0" },
		{ label: 'Object("")', content: Object(""), expectedJson: '""' },
		{ label: "Object(NaN)", content: Object(Number.NaN), expectedJson: "null" },
		{
			label: 'string "-Infinity"',
			content: "-Infinity",
			expectedJson: '"-Infinity"',
		},
		{ label: "number -1", content: -1, expectedJson: "-1" },
	])("prompt stays bare undefined while completion keeps residual ($label)", async ({
		content,
		expectedJson,
	}) => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "evt", request, {
			content,
		} as LlmResponse);

		const prompt = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.prompt",
		);
		expect(prompt![1]["gen_ai.prompt"]).toBeUndefined();

		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion![1]["gen_ai.completion"]).toBe(expectedJson);
	});
});
