import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Leftover: normalizeArraySchema copies items/minItems/maxItems/title/
 * description only. uniqueItems (and similar) survive on Type.ARRAY /
 * uppercase default paths and are stripped on lowercase "array".
 */
describe("schema-conversion Type-enum array uniqueItems trap leftover edges", () => {
	const enumArrayTypes: Array<{ label: string; type: any }> = [
		{ label: "Type.ARRAY", type: Type.ARRAY },
		{ label: "ARRAY string", type: "ARRAY" },
	];

	for (const { label, type } of enumArrayTypes) {
		it(`${label} preserves uniqueItems and does not recurse into items`, () => {
			expect(
				normalizeJsonSchema({
					type,
					items: {
						type: "string",
						minLength: 1,
						format: "email",
					},
					minItems: 1,
					maxItems: 3,
					uniqueItems: true,
					title: "emails",
				}),
			).toEqual({
				type,
				items: {
					type: "string",
					minLength: 1,
					format: "email",
				},
				minItems: 1,
				maxItems: 3,
				uniqueItems: true,
				title: "emails",
			});
		});
	}

	it('lowercase "array" strips uniqueItems and normalizes items', () => {
		expect(
			normalizeJsonSchema({
				type: "array",
				items: {
					type: "string",
					minLength: 1,
					format: "email",
				},
				minItems: 1,
				maxItems: 3,
				uniqueItems: true,
				title: "emails",
			}),
		).toEqual({
			type: Type.ARRAY,
			items: {
				type: Type.STRING,
				minLength: 1,
				format: "email",
			},
			minItems: 1,
			maxItems: 3,
			title: "emails",
		});
	});

	it("Type.ARRAY with Type.NUMBER items keeps exclusive bounds on items", () => {
		expect(
			normalizeJsonSchema({
				type: Type.ARRAY,
				items: {
					type: Type.NUMBER,
					exclusiveMinimum: 0,
				},
			}),
		).toEqual({
			type: Type.ARRAY,
			items: {
				type: Type.NUMBER,
				exclusiveMinimum: 0,
			},
		});
	});

	it('lowercase "array" with number items drops exclusive bounds on items', () => {
		expect(
			normalizeJsonSchema({
				type: "array",
				items: {
					type: "number",
					exclusiveMinimum: 0,
					maximum: 5,
				},
			}),
		).toEqual({
			type: Type.ARRAY,
			items: {
				type: "number",
				maximum: 5,
			},
		});
	});

	it("inferred array from items alone does not recurse (default branch)", () => {
		expect(
			normalizeJsonSchema({
				items: { type: "boolean", title: "flag" },
			}),
		).toEqual({
			type: Type.ARRAY,
			items: { type: "boolean", title: "flag" },
		});
	});
});
