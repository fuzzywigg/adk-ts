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
 * Tenth leftover: maxOutputTokens / temperature / topP || 0 on request attrs.
 * Usage-token || 0 is covered in sixth leftover; request-param matrix is not.
 */
describe("telemetry request-params or-zero tenth leftover edges", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;

	it.each([
		{
			label: "all undefined",
			config: {},
			expected: { max: 0, temp: 0, topP: 0 },
		},
		{
			label: "null / empty / false",
			config: {
				maxOutputTokens: null,
				temperature: "",
				topP: false,
			},
			expected: { max: 0, temp: 0, topP: 0 },
		},
		{
			label: "explicit zeros stay 0",
			config: { maxOutputTokens: 0, temperature: 0, topP: 0 },
			expected: { max: 0, temp: 0, topP: 0 },
		},
		{
			label: "truthy values preserved",
			config: { maxOutputTokens: 128, temperature: 0.5, topP: 0.9 },
			expected: { max: 128, temp: 0.5, topP: 0.9 },
		},
	])("traceLlmCall request params ($label)", async ({ config, expected }) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"e1",
			{ model: "m", config, contents: [] } as LlmRequest,
			{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.request.max_tokens"]).toBe(expected.max);
		expect(attrs["gen_ai.request.temperature"]).toBe(expected.temp);
		expect(attrs["gen_ai.request.top_p"]).toBe(expected.topP);
	});
});
