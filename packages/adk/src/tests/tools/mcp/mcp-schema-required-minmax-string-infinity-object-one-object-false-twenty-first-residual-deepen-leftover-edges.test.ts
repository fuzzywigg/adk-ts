import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twenty-first leftover residual deepen (complements #286 nan/posinf):
 * object `if (schema.required)` / array `minItems !== undefined` — string
 * `"Infinity"` / `Object(1)` / `Object(false)` required keep (truthy boxed);
 * minItems/maxItems keep via `!== undefined`.
 */
describe("mcp schema required/minmax string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
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

	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
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
