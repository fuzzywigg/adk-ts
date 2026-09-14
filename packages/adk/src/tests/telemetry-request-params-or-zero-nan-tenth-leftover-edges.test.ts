import { describe, expect, it, vi } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
import { TelemetryService } from "../telemetry";

/**
 * Tenth leftover: `maxOutputTokens` / `temperature` / `topP` use `|| 0`.
 * Falsy (incl. NaN) → 0; positives pass through. Distinct from usageMetadata || 0 sixth slice.
 */
describe("Telemetry request params || 0 / NaN tenth leftover (post #176)", () => {
	async function attrsFor(config: Record<string, unknown>) {
		const setAttributes = vi.fn();
		const addEvent = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent,
		} as any);

		const service = new TelemetryService();
		service.traceLlmCall(
			{ invocationId: "i", userId: "u", session: { id: "s" } } as any,
			"e",
			{ model: "m", config, contents: [] } as LlmRequest,
			{
				content: { role: "model", parts: [{ text: "x" }] },
			} as LlmResponse,
		);

		return setAttributes.mock.calls[0][0] as Record<string, unknown>;
	}

	it.each([
		{ label: "null", value: null },
		{ label: "undefined", value: undefined },
		{ label: "0", value: 0 },
		{ label: '""', value: "" },
		{ label: "false", value: false },
	] as const)("maxOutputTokens $label → gen_ai.request.max_tokens 0", async ({
		value,
	}) => {
		const attrs = await attrsFor({ maxOutputTokens: value as any });
		expect(attrs["gen_ai.request.max_tokens"]).toBe(0);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "undefined", value: undefined },
		{ label: "0", value: 0 },
		{ label: '""', value: "" },
		{ label: "false", value: false },
	] as const)("temperature $label → gen_ai.request.temperature 0", async ({
		value,
	}) => {
		const attrs = await attrsFor({ temperature: value as any });
		expect(attrs["gen_ai.request.temperature"]).toBe(0);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "undefined", value: undefined },
		{ label: "0", value: 0 },
		{ label: '""', value: "" },
		{ label: "false", value: false },
	] as const)("topP $label → gen_ai.request.top_p 0", async ({ value }) => {
		const attrs = await attrsFor({ topP: value as any });
		expect(attrs["gen_ai.request.top_p"]).toBe(0);
	});

	it("NaN is falsy in JS so maxOutputTokens/temperature/topP || 0 → 0", async () => {
		const attrs = await attrsFor({
			maxOutputTokens: Number.NaN,
			temperature: Number.NaN,
			topP: Number.NaN,
		});
		expect(attrs["gen_ai.request.max_tokens"]).toBe(0);
		expect(attrs["gen_ai.request.temperature"]).toBe(0);
		expect(attrs["gen_ai.request.top_p"]).toBe(0);
	});

	it("positive values pass through unchanged", async () => {
		const attrs = await attrsFor({
			maxOutputTokens: 128,
			temperature: 0.7,
			topP: 0.95,
		});
		expect(attrs["gen_ai.request.max_tokens"]).toBe(128);
		expect(attrs["gen_ai.request.temperature"]).toBe(0.7);
		expect(attrs["gen_ai.request.top_p"]).toBe(0.95);
	});
});
