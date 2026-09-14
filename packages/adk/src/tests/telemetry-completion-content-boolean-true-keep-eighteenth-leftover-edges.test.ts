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
 * Eighteenth leftover: `llmResponse.content || ""` residual after leftover
 * falsy matrix. Boolean `true` / string `"true"` / `[]` / `NEGATIVE_INFINITY`
 * stay into `_safeJsonStringify`; `-0` coalesces to `""`.
 */
describe("telemetry completion content boolean-true keep eighteenth leftover edges", () => {
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
		{ label: "boolean true", content: true, expectedJson: "true" },
		{ label: "string true", content: "true", expectedJson: '"true"' },
		{ label: "empty array", content: [], expectedJson: "[]" },
		{
			label: "NEGATIVE_INFINITY",
			content: Number.NEGATIVE_INFINITY,
			expectedJson: "null",
		},
	])("keeps truthy near-miss content ($label) in completion event", async ({
		content,
		expectedJson,
	}) => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			content,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion?.[1]["gen_ai.completion"]).toBe(expectedJson);
	});

	it('-0 SameValueZero-collapses to "" then stringifies as empty string', async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			content: -0 as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion?.[1]["gen_ai.completion"]).toBe('""');
	});
});
