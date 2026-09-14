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
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip 96457a9 / #248):
 * request-param `|| 0` after eighteenth true/`"true"`/`[]`/`-Infinity`/`-0`.
 * `NaN` coalesces; `POSITIVE_INFINITY` stays.
 */
describe("telemetry request-params nan posinf nineteenth leftover edges", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;

	it("NaN coalesces via || 0 on all three request params", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"e1",
			{
				model: "m",
				config: {
					maxOutputTokens: Number.NaN,
					temperature: Number.NaN,
					topP: Number.NaN,
				},
				contents: [],
			} as LlmRequest,
			{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.request.max_tokens"]).toBe(0);
		expect(attrs["gen_ai.request.temperature"]).toBe(0);
		expect(attrs["gen_ai.request.top_p"]).toBe(0);
	});

	it("POSITIVE_INFINITY stays on all three request params", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"e1",
			{
				model: "m",
				config: {
					maxOutputTokens: Number.POSITIVE_INFINITY,
					temperature: Number.POSITIVE_INFINITY,
					topP: Number.POSITIVE_INFINITY,
				},
				contents: [],
			} as LlmRequest,
			{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.request.max_tokens"]).toBe(Number.POSITIVE_INFINITY);
		expect(attrs["gen_ai.request.temperature"]).toBe(Number.POSITIVE_INFINITY);
		expect(attrs["gen_ai.request.top_p"]).toBe(Number.POSITIVE_INFINITY);
	});
});
