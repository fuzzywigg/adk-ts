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
 * Seventeenth leftover: `if (llmResponse.usageMetadata)` is truthiness-only.
 * Sixth leftover pinned falsy skip + empty-object emit; fourteenth pinned
 * token-field `|| 0`. Truthy near-miss containers enter the gate; missing
 * token props read as undefined and still coalesce to 0.
 */
describe("telemetry usageMetadata truthy near-miss emit seventeenth leftover edges", () => {
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;
	const request = { model: "m", config: {}, contents: [] } as LlmRequest;

	it.each([
		{ label: "undefined", usageMetadata: undefined },
		{ label: "null", usageMetadata: null },
		{ label: "0", usageMetadata: 0 },
		{ label: "false", usageMetadata: false },
		{ label: "empty string", usageMetadata: "" },
	])("skips usage attrs when usageMetadata is falsy ($label)", async ({
		usageMetadata,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			usageMetadata,
		} as LlmResponse);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall).toBeUndefined();
	});

	it.each([
		{ label: "zero string", usageMetadata: "0" },
		{ label: "whitespace", usageMetadata: " " },
		{ label: "true", usageMetadata: true },
		{ label: "1", usageMetadata: 1 },
	])("truthy near-miss $label enters gate and emits usage attrs as 0", async ({
		usageMetadata,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			usageMetadata,
		} as LlmResponse);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(0);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(0);
	});

	it("empty-object usageMetadata still emits usage attrs as 0", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(invocation, "e1", request, {
			usageMetadata: {},
		} as LlmResponse);
		const usageCall = setAttributes.mock.calls.find(
			(c) => "gen_ai.usage.input_tokens" in c[0],
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(0);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(0);
	});
});
