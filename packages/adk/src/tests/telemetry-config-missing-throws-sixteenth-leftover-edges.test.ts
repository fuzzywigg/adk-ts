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
 * Sixteenth leftover: Telemetry `llmRequest.config.maxOutputTokens` (no `?.`)
 * throws when config is missing/null. Tenth leftover always passed a config
 * object. BaseLlm `config?.` asymmetry is covered in the paired models test.
 */
describe("telemetry config missing throws sixteenth leftover edges", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;

	it.each([
		{ label: "undefined config", config: undefined },
		{ label: "null config", config: null },
	])("traceLlmCall throws when config is $label", async ({ config }) => {
		await withActiveSpan();
		const service = new TelemetryService();
		expect(() =>
			service.traceLlmCall(
				invocation,
				"e1",
				{ model: "m", config, contents: [] } as any,
				{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
			),
		).toThrow();
	});

	it("empty config object still coalesces params via || 0", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"e1",
			{ model: "m", config: {}, contents: [] } as LlmRequest,
			{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.request.max_tokens"]).toBe(0);
		expect(attrs["gen_ai.request.temperature"]).toBe(0);
		expect(attrs["gen_ai.request.top_p"]).toBe(0);
	});
});
