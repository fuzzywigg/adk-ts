import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twenty-first leftover residual deepen (complements #286 nan/posinf):
 * determineSchemaType `schema.pattern` truthy-if + `multipleOf % 1 === 0` —
 * string `"Infinity"` / `Object(1)` / `Object(false)` pattern→STRING;
 * multipleOf `"Infinity"`→NUMBER; `Object(1)`/`Object(false)`→INTEGER.
 */
describe("mcp schema infer pattern/multipleof string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("pattern $label alone infers STRING", ({ value }) => {
		expect(normalizeJsonSchema({ pattern: value as any })).toEqual({
			type: Type.STRING,
			pattern: value,
		});
	});

	it.each([
		{
			label: 'string "Infinity"',
			value: "Infinity",
			expected: Type.NUMBER,
		},
		{ label: "Object(1)", value: Object(1), expected: Type.INTEGER },
		{ label: "Object(false)", value: Object(false), expected: Type.INTEGER },
	])("minimum + multipleOf $label → $expected", ({ value, expected }) => {
		expect(
			normalizeJsonSchema({
				minimum: 0,
				multipleOf: value as any,
			}),
		).toEqual({
			type: expected,
			minimum: 0,
			multipleOf: value,
		});
	});
});
