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
 * Eighteenth leftover: request-param `|| 0` residual after tenth falsy /
 * whitespace matrix. Boolean `true` / string `"true"` / empty `[]` /
 * `NEGATIVE_INFINITY` stay; `-0` is falsy and SameValueZero-collapses to `0`.
 */
describe("telemetry request-params boolean-true negzero infinity eighteenth leftover edges", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;

	it.each([
		{ label: "boolean true", value: true },
		{ label: "string true", value: "true" },
		{ label: "empty array", value: [] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("keeps truthy near-miss $label on all three request params", async ({
		value,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"e1",
			{
				model: "m",
				config: {
					maxOutputTokens: value,
					temperature: value,
					topP: value,
				},
				contents: [],
			} as LlmRequest,
			{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.request.max_tokens"]).toBe(value);
		expect(attrs["gen_ai.request.temperature"]).toBe(value);
		expect(attrs["gen_ai.request.top_p"]).toBe(value);
	});

	it("-0 SameValueZero-collapses via || 0 on all three request params", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"e1",
			{
				model: "m",
				config: {
					maxOutputTokens: -0,
					temperature: -0,
					topP: -0,
				},
				contents: [],
			} as LlmRequest,
			{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.request.max_tokens"]).toBe(0);
		expect(attrs["gen_ai.request.temperature"]).toBe(0);
		expect(attrs["gen_ai.request.top_p"]).toBe(0);
		expect(Object.is(attrs["gen_ai.request.max_tokens"], -0)).toBe(false);
	});
});
