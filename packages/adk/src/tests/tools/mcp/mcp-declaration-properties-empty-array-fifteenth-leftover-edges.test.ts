import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { declarationToJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Fifteenth leftover: `if (declaration.parameters.properties)` — empty array
 * is truthy so returns [] and drops sibling required/type on the bag.
 */
describe("mcp declaration properties empty array fifteenth leftover", () => {
	it("properties: [] is truthy and returned, dropping required", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				description: "d",
				parameters: {
					type: Type.OBJECT,
					properties: [] as any,
					required: ["x"],
				},
			}),
		).toEqual([]);
	});

	it("missing properties returns whole parameters bag (control)", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				description: "d",
				parameters: {
					type: Type.OBJECT,
					required: ["x"],
				} as any,
			}),
		).toEqual({
			type: Type.OBJECT,
			required: ["x"],
		});
	});

	it("object properties bag is returned (control)", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				description: "d",
				parameters: {
					type: Type.OBJECT,
					properties: { x: { type: Type.STRING } },
					required: ["x"],
				},
			}),
		).toEqual({ x: { type: Type.STRING } });
	});
});
