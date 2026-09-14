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
 * Fourteenth leftover: promptTokenCount / candidatesTokenCount || 0 —
 * sixth pinned "" → 0; truthy-odd " " / "0" stay.
 */
describe("telemetry usage token whitespace zero-string fourteenth leftover edges", () => {
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

	it("empty-string tokens coalesce to 0", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "evt", request, {
			usageMetadata: {
				promptTokenCount: "",
				candidatesTokenCount: "",
			},
		} as LlmResponse);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]).toMatchObject({
			"gen_ai.usage.input_tokens": 0,
			"gen_ai.usage.output_tokens": 0,
		});
	});

	it("whitespace tokens are kept (truthy)", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "evt", request, {
			usageMetadata: {
				promptTokenCount: " ",
				candidatesTokenCount: " ",
			},
		} as LlmResponse);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]).toMatchObject({
			"gen_ai.usage.input_tokens": " ",
			"gen_ai.usage.output_tokens": " ",
		});
	});

	it('string "0" tokens are kept (unlike numeric 0 → 0 via ||)', async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "evt", request, {
			usageMetadata: {
				promptTokenCount: "0",
				candidatesTokenCount: "0",
			},
		} as LlmResponse);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]).toMatchObject({
			"gen_ai.usage.input_tokens": "0",
			"gen_ai.usage.output_tokens": "0",
		});
	});
});
