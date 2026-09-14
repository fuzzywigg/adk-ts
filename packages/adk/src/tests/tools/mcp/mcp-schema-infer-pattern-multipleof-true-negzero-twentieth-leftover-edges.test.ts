import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual complement after #259):
 * determineSchemaType `schema.pattern` truthy-if + `multipleOf % 1 === 0` —
 * boolean `true` / `"true"` / `[]` infer STRING via pattern; `-0` skips pattern;
 * multipleOf residual: `-0`/`true`/`[]` → INTEGER; `"true"` → NUMBER (NaN % 1).
 * Sixth pinned classic length/multipleOf numerics.
 */
describe("mcp schema infer pattern/multipleof true/negzero twentieth leftover complement", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
	])("pattern $label alone infers STRING", ({ value }) => {
		expect(normalizeJsonSchema({ pattern: value as any })).toEqual({
			type: Type.STRING,
			pattern: value,
		});
	});

	it("pattern -0 is falsy → Type.OBJECT via default branch (keeps pattern)", () => {
		expect(normalizeJsonSchema({ pattern: -0 as any })).toEqual({
			pattern: -0,
			type: Type.OBJECT,
		});
	});

	it.each([
		{ label: "boolean true", value: true, expected: Type.INTEGER },
		{ label: "empty array", value: [] as never[], expected: Type.INTEGER },
		{ label: "-0", value: -0, expected: Type.INTEGER },
		{ label: '"true"', value: "true", expected: Type.NUMBER },
	])("minimum + multipleOf $label → $expected (uppercase Type hits default keep)", ({
		value,
		expected,
	}) => {
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
