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
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `llmResponse.content || ""` — boxed-falsy / `"-Infinity"` / `-1`
 * stringify asymmetries (Object(false)→true JSON false; Object("")→""; etc.).
 */
describe("telemetry completion content object-false/zero/empty nineteenth residual deepen", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;
	const request = {
		model: "m",
		config: {},
		contents: [],
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
	])("$label stays into stringify → $expectedJson", async ({
		content,
		expectedJson,
	}) => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			content: content as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion?.[1]["gen_ai.completion"]).toBe(expectedJson);
	});
});
