import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after providers tip #269):
 * object `if (schema.required)` / array `minItems !== undefined` — complements
 * closed #271 true/`"true"`/`-Infinity` keep / `-0` drop with
 * `POSITIVE_INFINITY` / `1` / `[]` keep; `NaN` required drop; minItems `NaN` /
 * `POSITIVE_INFINITY` / `{}` keep via `!== undefined`.
 */
describe("mcp schema required/minmax nan/posinf twentieth leftover heavy", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty array", value: [] as never[] },
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

	it("required NaN dropped via falsy if", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				required: Number.NaN as any,
			}),
		).toEqual({ type: Type.OBJECT, properties: {} });
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NaN", value: Number.NaN },
		{ label: "{}", value: {} },
		{ label: "number 1", value: 1 },
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
