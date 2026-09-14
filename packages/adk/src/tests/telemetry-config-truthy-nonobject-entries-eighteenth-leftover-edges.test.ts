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
 * Eighteenth leftover: `_excludeNonSerializableFromConfig` runs
 * `Object.entries(config)` with no nullish guard. Sixteenth pinned
 * null/undefined throw. Falsy primitives yield `[]` → empty built config;
 * truthy strings become char-index entries. Sibling of contents for-of
 * seventeenth leftover.
 */
describe("telemetry config truthy nonobject entries eighteenth leftover edges", () => {
	const service = new TelemetryService();
	const invocation = {
		invocationId: "inv",
		userId: "u",
		session: { id: "s" },
	} as any;
	const build = (config: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config,
			contents: [],
		} as LlmRequest);

	it.each([
		{ label: "undefined", config: undefined },
		{ label: "null", config: null },
	])("still throws on nullish config ($label)", ({ config }) => {
		expect(() => build(config)).toThrow();
	});

	it.each([
		{ label: "0", config: 0 },
		{ label: "false", config: false },
		{ label: "empty string", config: "" },
	])("falsy primitive $label → Object.entries [] → empty config object", ({
		config,
	}) => {
		expect(build(config).config).toEqual({});
	});

	it('truthy string "0" becomes char-index config entries', () => {
		expect(build("0").config).toEqual({ "0": "0" });
	});

	it("truthy whitespace string becomes per-char config entries", () => {
		expect(build("  ").config).toEqual({ "0": " ", "1": " " });
	});

	it.each([
		{ label: "true", config: true },
		{ label: "1", config: 1 },
	])("truthy non-string non-object $label → empty entries", ({ config }) => {
		expect(build(config).config).toEqual({});
	});

	it("falsy primitive config still lets span attrs coalesce || 0", async () => {
		const { setAttributes } = await withActiveSpan();
		service.traceLlmCall(
			invocation,
			"e1",
			{ model: "m", config: 0 as any, contents: [] } as LlmRequest,
			{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.request.max_tokens"]).toBe(0);
		expect(attrs["gen_ai.request.temperature"]).toBe(0);
		expect(attrs["gen_ai.request.top_p"]).toBe(0);
	});
});
