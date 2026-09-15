import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after providers tip #269):
 * determineSchemaType `schema.pattern` truthy-if + `multipleOf % 1 === 0` —
 * complements closed #271 true/`"true"`/`[]`/`-0` pins with
 * `POSITIVE_INFINITY` / `1` / `{}` pattern→STRING; `NaN` pattern→OBJECT;
 * multipleOf `POSITIVE_INFINITY`/`NaN`/`{}`→NUMBER; `1`/`Object(true)`→INTEGER.
 */
describe("mcp schema infer pattern/multipleof nan/posinf twentieth leftover heavy", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "{}", value: {} },
	])("pattern $label alone infers STRING", ({ value }) => {
		expect(normalizeJsonSchema({ pattern: value as any })).toEqual({
			type: Type.STRING,
			pattern: value,
		});
	});

	it("pattern NaN is falsy → Type.OBJECT via default branch (keeps pattern)", () => {
		expect(normalizeJsonSchema({ pattern: Number.NaN as any })).toEqual({
			pattern: Number.NaN,
			type: Type.OBJECT,
		});
	});

	it.each([
		{
			label: "POSITIVE_INFINITY",
			value: Number.POSITIVE_INFINITY,
			expected: Type.NUMBER,
		},
		{ label: "NaN", value: Number.NaN, expected: Type.NUMBER },
		{ label: "{}", value: {}, expected: Type.NUMBER },
		{ label: "number 1", value: 1, expected: Type.INTEGER },
		{ label: "Object(true)", value: Object(true), expected: Type.INTEGER },
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
