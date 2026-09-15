import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twenty-first leftover (HEAVY tip-relaunch residual after fourteenth
 * `type: true` default passthrough): `if (!normalizedSchema.type)` —
 * SameValueZero `-0` is falsy → `determineSchemaType` overwrites; `"true"` /
 * `[]` are truthy → default passthrough (not object/array cases).
 */
describe("mcp schema type true vs negzero infer twenty-first leftover", () => {
	it("type: -0 is falsy → determineSchemaType overwrites to OBJECT (default passthrough)", () => {
		expect(normalizeJsonSchema({ type: -0 as any, title: "x" })).toEqual({
			type: Type.OBJECT,
			title: "x",
		});
	});

	it('type: "true" is truthy → default passthrough keeps string type', () => {
		expect(normalizeJsonSchema({ type: "true" as any, title: "x" })).toEqual({
			type: "true",
			title: "x",
		});
	});

	it("type: [] is truthy → default passthrough keeps array type", () => {
		expect(normalizeJsonSchema({ type: [] as any, title: "x" })).toEqual({
			type: [],
			title: "x",
		});
	});

	it("type: true still default-passthrough (control vs fourteenth)", () => {
		expect(normalizeJsonSchema({ type: true as any, title: "x" })).toEqual({
			type: true,
			title: "x",
		});
	});
});
