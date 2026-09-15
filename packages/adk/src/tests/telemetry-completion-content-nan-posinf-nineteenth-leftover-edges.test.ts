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
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #258):
 * `llmResponse.content || ""` after eighteenth true/`"true"`/`[]`/`-Infinity`/
 * `-0`. `NaN` coalesces to `""`; `POSITIVE_INFINITY` stringifies as `null`.
 */
describe("telemetry completion content nan posinf nineteenth leftover edges", () => {
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

	it('NaN coalesces to "" then stringifies as empty string', async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			content: Number.NaN as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion?.[1]["gen_ai.completion"]).toBe('""');
	});

	it("POSITIVE_INFINITY stays into stringify → null JSON", async () => {
		const { addEvent } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			content: Number.POSITIVE_INFINITY as any,
		} as LlmResponse);
		const completion = addEvent.mock.calls.find(
			(c) => c[0] === "gen_ai.content.completion",
		);
		expect(completion?.[1]["gen_ai.completion"]).toBe("null");
	});
});
