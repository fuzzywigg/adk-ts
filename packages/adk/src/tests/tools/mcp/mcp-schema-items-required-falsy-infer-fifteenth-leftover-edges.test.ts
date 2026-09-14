import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Fifteenth leftover: `if (schema.items)` / `if (schema.required)` truthiness
 * before default Type.OBJECT. Falsy items do not infer ARRAY; falsy required
 * skips the early OBJECT branch (still defaults to OBJECT). `required: []`
 * is truthy and takes the early OBJECT branch; `items: {}` infers ARRAY.
 */
describe("mcp schema items/required falsy infer fifteenth leftover", () => {
	it.each([
		0,
		false,
		"",
	] as const)("items: %j alone does not infer ARRAY (defaults to OBJECT)", (items) => {
		expect(normalizeJsonSchema({ items })).toEqual({
			type: Type.OBJECT,
			items,
		});
	});

	it.each([
		false,
		0,
		"",
	] as const)("required: %j skips early OBJECT branch but still defaults to OBJECT", (required) => {
		expect(normalizeJsonSchema({ required })).toEqual({
			type: Type.OBJECT,
			required,
		});
	});

	it("required: [] is truthy so alone still takes early OBJECT branch", () => {
		expect(normalizeJsonSchema({ required: [] })).toEqual({
			type: Type.OBJECT,
			required: [],
		});
	});

	it("items: {} still infers ARRAY (control)", () => {
		expect(normalizeJsonSchema({ items: {} })).toEqual({
			type: Type.ARRAY,
			items: {},
		});
	});
});
