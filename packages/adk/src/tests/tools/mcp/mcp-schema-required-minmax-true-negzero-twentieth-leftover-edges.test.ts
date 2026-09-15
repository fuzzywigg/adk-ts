import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual complement after providers tip #269 / #259):
 * object `if (schema.required)` / `if (schema.title)` — boolean `true` /
 * `"true"` / `NEGATIVE_INFINITY` kept; SameValueZero `-0` dropped (falsy if).
 * Array minItems/maxItems use `!== undefined` so `-0` / `true` kept.
 * Thirteenth pinned required `[]` + title `"0"`; #259 covers typed title if.
 */
describe("mcp schema required/minmax true/negzero twentieth leftover complement", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("required $label kept via truthy if", ({ value }) => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				required: value as any,
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
			required: value,
		});
	});

	it("required -0 dropped via falsy if", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				required: -0 as any,
			}),
		).toEqual({ type: Type.OBJECT, properties: {} });
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "-0", value: -0 },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("minItems/maxItems $label kept via !== undefined", ({ value }) => {
		expect(
			normalizeJsonSchema({
				type: "array",
				items: { type: "string" },
				minItems: value as any,
				maxItems: value as any,
			}),
		).toEqual({
			type: Type.ARRAY,
			items: { type: Type.STRING },
			minItems: value,
			maxItems: value,
		});
	});
});
