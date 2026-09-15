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
 * Twentieth leftover residual deepen (complements #282 object-true/one/infinity):
 * `llmResponse.content || ""` — boxed falsy stringify asymmetries:
 * Object(false)→"false", Object(0)→"0", Object(NaN)→"null".
 */
describe("telemetry completion content object-false/zero/nan twentieth residual deepen", () => {
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

	it("Object(false) stays into stringify → false JSON", async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			content: Object(false) as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion?.[1]["gen_ai.completion"]).toBe("false");
	});

	it("Object(0) stays into stringify → 0", async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			content: Object(0) as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion?.[1]["gen_ai.completion"]).toBe("0");
	});

	it("Object(NaN) stays into stringify → null JSON", async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			content: Object(Number.NaN) as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion?.[1]["gen_ai.completion"]).toBe("null");
	});
});
