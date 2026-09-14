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
 * Leftover: llmResponse.content || "" falsy matrix beyond undefined-only coverage.
 */
describe("telemetry completion content falsy coalesce leftover edges", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;

	const request = {
		model: "m",
		config: { temperature: 0 },
		contents: [{ role: "user", parts: [{ text: "hi" }] }],
	} as LlmRequest;

	it.each([
		{ label: "undefined", content: undefined, expected: "" },
		{ label: "null", content: null, expected: "" },
		{ label: "empty string", content: "", expected: "" },
		{ label: "0", content: 0, expected: "" },
		{ label: "false", content: false, expected: "" },
		{
			label: "populated content",
			content: { role: "model", parts: [{ text: "out" }] },
			expected: { role: "model", parts: [{ text: "out" }] },
		},
	])("traceLlmCall completion event coalesces content ($label)", async ({
		content,
		expected,
	}) => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "evt", request, {
			content,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion).toBeTruthy();
		expect(JSON.parse(completion![1]["gen_ai.completion"])).toEqual(expected);
	});

	it("empty object content is truthy and serializes as {}", async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "evt", request, {
			content: {},
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(JSON.parse(completion![1]["gen_ai.completion"])).toEqual({});
	});
});
