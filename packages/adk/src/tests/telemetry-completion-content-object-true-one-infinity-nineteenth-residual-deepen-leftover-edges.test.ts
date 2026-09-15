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
 * Nineteenth leftover residual deepen (complements #269 NaN/posinf):
 * `llmResponse.content || ""` — truthy residual stringify asymmetries.
 */
describe("telemetry completion content object-true/one/infinity nineteenth residual deepen", () => {
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

	it("Object(true) stays into stringify → true JSON", async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			content: Object(true) as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion?.[1]["gen_ai.completion"]).toBe("true");
	});

	it("number 1 stays into stringify → 1", async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			content: 1 as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion?.[1]["gen_ai.completion"]).toBe("1");
	});

	it('string "Infinity" stays into stringify → quoted Infinity', async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			content: "Infinity" as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion?.[1]["gen_ai.completion"]).toBe('"Infinity"');
	});

	it("empty object {} stays into stringify → {}", async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			content: {} as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion?.[1]["gen_ai.completion"]).toBe("{}");
	});
});
