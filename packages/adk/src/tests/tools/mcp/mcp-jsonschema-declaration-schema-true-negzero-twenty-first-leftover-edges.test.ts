import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { jsonSchemaToDeclaration } from "../../../tools/mcp/schema-conversion";

const emptyObjectParameters = {
	type: Type.OBJECT,
	properties: {},
};

/**
 * Twenty-first leftover (HEAVY tip-relaunch residual after eleventh falsy
 * schema → empty OBJECT): outer `if (schema)` — SameValueZero `-0` → empty
 * default; boolean `true` / `"true"` / `[]` wrap as properties bag.
 */
describe("mcp jsonschema declaration schema true/negzero twenty-first leftover", () => {
	it("schema: -0 is falsy → empty object parameters", () => {
		expect(jsonSchemaToDeclaration("n", "d", -0 as any).parameters).toEqual(
			emptyObjectParameters,
		);
	});

	it("schema: boolean true wraps as properties bag", () => {
		expect(jsonSchemaToDeclaration("n", "d", true as any).parameters).toEqual({
			type: Type.OBJECT,
			properties: true,
		});
	});

	it('schema: "true" wraps as properties bag (string)', () => {
		expect(jsonSchemaToDeclaration("n", "d", "true" as any).parameters).toEqual(
			{
				type: Type.OBJECT,
				properties: "true",
			},
		);
	});

	it("schema: NEGATIVE_INFINITY wraps as properties bag", () => {
		expect(
			jsonSchemaToDeclaration("n", "d", Number.NEGATIVE_INFINITY as any)
				.parameters,
		).toEqual({
			type: Type.OBJECT,
			properties: Number.NEGATIVE_INFINITY,
		});
	});
});
