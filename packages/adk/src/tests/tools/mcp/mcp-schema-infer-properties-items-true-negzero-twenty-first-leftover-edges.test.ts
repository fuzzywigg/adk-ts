import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twenty-first leftover (HEAVY tip-relaunch residual): untyped
 * `determineSchemaType` `schema.properties` / `schema.items` truthiness —
 * `true` / `"true"` / `[]` → OBJECT / ARRAY; SameValueZero `-0` → OBJECT
 * default (no infer).
 */
describe("mcp schema infer properties/items true/negzero twenty-first leftover", () => {
	it.each([
		{ label: "boolean true", properties: true },
		{ label: '"true"', properties: "true" },
		{ label: "empty array", properties: [] as never[] },
	])("untyped properties $label → determineSchemaType OBJECT", ({
		properties,
	}) => {
		const result = normalizeJsonSchema({ properties } as any);
		expect(result.type).toBe(Type.OBJECT);
	});

	it("untyped properties -0 is falsy → OBJECT default keeps -0 (no object normalize)", () => {
		expect(normalizeJsonSchema({ properties: -0 as any })).toEqual({
			type: Type.OBJECT,
			properties: -0,
		});
	});

	it.each([
		{ label: "boolean true", items: true },
		{ label: '"true"', items: "true" },
		{ label: "empty array", items: [] as never[] },
	])("untyped items $label → determineSchemaType ARRAY", ({ items }) => {
		const result = normalizeJsonSchema({ items } as any);
		expect(result.type).toBe(Type.ARRAY);
	});

	it("untyped items -0 is falsy → OBJECT default keeps -0 (no ARRAY infer)", () => {
		expect(normalizeJsonSchema({ items: -0 as any })).toEqual({
			type: Type.OBJECT,
			items: -0,
		});
	});
});
