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
 * Eighteenth leftover (HEAVY tip-relaunch residual after #236):
 * `_excludeNonSerializableFromConfig` runs `Object.entries(config)` with no
 * nullish guard. Sixteenth pinned null/undefined throw. Falsy primitives /
 * SameValueZero `-0` yield `[]` → empty built config; truthy strings become
 * char-index entries; boolean `true` / `[]` / `-Infinity` → empty entries.
 * Sibling of contents for-of seventeenth leftover.
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
		{ label: "-0", config: -0 },
	])("falsy primitive $label → Object.entries [] → empty config object", ({
		config,
	}) => {
		expect(build(config).config).toEqual({});
	});

	it('truthy string "0" becomes char-index config entries', () => {
		expect(build("0").config).toEqual({ "0": "0" });
	});

	it('truthy string "true" becomes per-char config entries', () => {
		expect(build("true").config).toEqual({
			"0": "t",
			"1": "r",
			"2": "u",
			"3": "e",
		});
	});

	it("truthy whitespace string becomes per-char config entries", () => {
		expect(build("  ").config).toEqual({ "0": " ", "1": " " });
	});

	it.each([
		{ label: "true", config: true },
		{ label: "1", config: 1 },
		{ label: "empty array", config: [] },
		{ label: "NEGATIVE_INFINITY", config: Number.NEGATIVE_INFINITY },
	])("truthy non-string non-object $label → empty entries", ({ config }) => {
		expect(build(config).config).toEqual({});
	});

	it.each([
		{ label: "0", config: 0 },
		{ label: "-0", config: -0 },
		{ label: "true", config: true },
		{ label: "empty array", config: [] },
		{ label: "NEGATIVE_INFINITY", config: Number.NEGATIVE_INFINITY },
	])("non-object config $label still lets span attrs coalesce via || 0", async ({
		config,
	}) => {
		const { setAttributes } = await withActiveSpan();
		service.traceLlmCall(
			invocation,
			"e1",
			{ model: "m", config: config as any, contents: [] } as LlmRequest,
			{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.request.max_tokens"]).toBe(0);
		expect(attrs["gen_ai.request.temperature"]).toBe(0);
		expect(attrs["gen_ai.request.top_p"]).toBe(0);
	});
});
