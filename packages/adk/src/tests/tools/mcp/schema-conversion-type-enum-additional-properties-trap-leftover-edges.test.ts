import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Leftover: lowercase "object" runs normalizeObjectSchema (drops
 * additionalProperties / minProperties). Type.OBJECT / "OBJECT" hit the
 * default switch branch and preserve those fields.
 */
describe("schema-conversion Type-enum additionalProperties trap leftover edges", () => {
	const preserveCases: Array<{ label: string; type: any }> = [
		{ label: "Type.OBJECT", type: Type.OBJECT },
		{ label: "OBJECT string", type: "OBJECT" },
		{ label: "Object mixed case", type: "Object" },
	];

	for (const { label, type } of preserveCases) {
		it(`${label} preserves additionalProperties and minProperties`, () => {
			expect(
				normalizeJsonSchema({
					type,
					additionalProperties: true,
					minProperties: 2,
					properties: { x: { type: Type.STRING } },
					title: "bag",
				}),
			).toEqual({
				type,
				additionalProperties: true,
				minProperties: 2,
				properties: { x: { type: Type.STRING } },
				title: "bag",
			});
		});
	}

	it('lowercase "object" strips additionalProperties and minProperties', () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				additionalProperties: true,
				minProperties: 2,
				properties: { x: { type: "string" } },
				title: "bag",
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: { x: { type: Type.STRING } },
			title: "bag",
		});
	});

	it("inferred Type.OBJECT from additionalProperties keeps the flag", () => {
		expect(
			normalizeJsonSchema({
				additionalProperties: false,
				required: ["id"],
			}),
		).toEqual({
			type: Type.OBJECT,
			additionalProperties: false,
			required: ["id"],
		});
	});

	it("inferred Type.OBJECT from properties alone does not invent additionalProperties", () => {
		expect(
			normalizeJsonSchema({
				properties: { a: { type: "string" } },
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: { a: { type: "string" } },
		});
	});

	it('lowercase "object" without properties still yields empty properties bag', () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				additionalProperties: true,
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});
});
