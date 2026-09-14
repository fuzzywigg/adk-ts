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
 * Eighteenth leftover (HEAVY tip-relaunch residual after #236): prompt event
 * reads `requestData.messages`, but `_buildLlmRequestForTrace` only sets
 * `contents`. `_safeJsonStringify(undefined)` returns bare `undefined`
 * (JSON.stringify undefined), while completion always gets a string via
 * `content || ""`. Complements completion boolean-true-keep eighteenth.
 */
describe("telemetry prompt messages undefined stringify eighteenth leftover edges", () => {
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

	it("prompt event gen_ai.prompt is bare undefined (missing messages key)", async () => {
		const { addEvent, setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "evt", request, {
			content: { role: "model", parts: [{ text: "out" }] },
		} as LlmResponse);

		const prompt = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.prompt",
		);
		expect(prompt).toBeTruthy();
		expect(prompt![1]["gen_ai.prompt"]).toBeUndefined();

		const attrs = setAttributes.mock.calls[0][0];
		const parsed = JSON.parse(attrs["adk.llm_request"]);
		expect(parsed.contents).toEqual([
			{ role: "user", parts: [{ text: "hi" }] },
		]);
		expect(parsed.messages).toBeUndefined();
	});

	it.each([
		{ label: "boolean true", content: true, expectedJson: "true" },
		{ label: "string true", content: "true", expectedJson: '"true"' },
		{ label: "empty array", content: [], expectedJson: "[]" },
		{
			label: "NEGATIVE_INFINITY",
			content: Number.NEGATIVE_INFINITY,
			expectedJson: "null",
		},
	])("prompt stays bare undefined while completion keeps truthy near-miss ($label)", async ({
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

	it('completion event still always emits a JSON string (undefined content → "")', async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "evt", request, {
			content: undefined,
		} as LlmResponse);

		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(typeof completion![1]["gen_ai.completion"]).toBe("string");
		expect(JSON.parse(completion![1]["gen_ai.completion"])).toBe("");
	});

	it('prompt stays bare undefined while -0 completion coalesces to ""', async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "evt", request, {
			content: -0 as any,
		} as LlmResponse);

		const prompt = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.prompt",
		);
		expect(prompt![1]["gen_ai.prompt"]).toBeUndefined();

		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion![1]["gen_ai.completion"]).toBe('""');
	});
});
