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
 * Fourteenth leftover: content || "" — number 0 → ""; string "0" is truthy
 * and kept. Prior leftover pinned numeric 0 and whitespace " ".
 */
describe("telemetry completion content zero-string fourteenth leftover edges", () => {
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

	it('number 0 content coalesces to ""', async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "evt", request, {
			content: 0 as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(JSON.parse(completion![1]["gen_ai.completion"])).toBe("");
	});

	it('string "0" content is kept', async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "evt", request, {
			content: "0" as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(JSON.parse(completion![1]["gen_ai.completion"])).toBe("0");
	});

	it("false content coalesces to empty string", async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "evt", request, {
			content: false as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(JSON.parse(completion![1]["gen_ai.completion"])).toBe("");
	});
});
