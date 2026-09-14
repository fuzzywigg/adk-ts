import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after #233 nineteenth):
 * typed string `if (schema.pattern)` / `if (schema.format)` — boolean `true` /
 * `"true"` / `[]` / `NEGATIVE_INFINITY` kept; SameValueZero `-0` dropped.
 * Nineteenth pinned string `"0"`/`"false"` only.
 */
describe("mcp schema pattern/format true/negzero twentieth leftover", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("typed string pattern $label kept via truthy if", ({ value }) => {
		expect(
			normalizeJsonSchema({
				type: "string",
				pattern: value,
			}),
		).toEqual({
			type: Type.STRING,
			pattern: value,
		});
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("typed string format $label kept via truthy if", ({ value }) => {
		expect(
			normalizeJsonSchema({
				type: "string",
				format: value,
			}),
		).toEqual({
			type: Type.STRING,
			format: value,
		});
	});

	it("typed string pattern/format -0 dropped (SameValueZero falsy)", () => {
		expect(
			normalizeJsonSchema({
				type: "string",
				pattern: -0 as any,
				format: -0 as any,
			}),
		).toEqual({
			type: Type.STRING,
		});
	});
});
