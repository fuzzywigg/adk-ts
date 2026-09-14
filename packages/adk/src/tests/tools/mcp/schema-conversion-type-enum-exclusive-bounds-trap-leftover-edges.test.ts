import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Leftover: normalizeNumberSchema only copies minimum/maximum/enum/title/
 * description. exclusiveMinimum/exclusiveMaximum survive only on the Type
 * enum / uppercase default-branch path.
 */
describe("schema-conversion Type-enum exclusive-bounds trap leftover edges", () => {
	const enumNumberTypes: Array<{ label: string; type: any }> = [
		{ label: "Type.NUMBER", type: Type.NUMBER },
		{ label: "NUMBER string", type: "NUMBER" },
		{ label: "Type.INTEGER", type: Type.INTEGER },
		{ label: "INTEGER string", type: "INTEGER" },
	];

	for (const { label, type } of enumNumberTypes) {
		it(`${label} preserves exclusiveMinimum/exclusiveMaximum`, () => {
			expect(
				normalizeJsonSchema({
					type,
					minimum: 1,
					maximum: 10,
					exclusiveMinimum: 0,
					exclusiveMaximum: 11,
					enum: [1, 2],
				}),
			).toEqual({
				type,
				minimum: 1,
				maximum: 10,
				exclusiveMinimum: 0,
				exclusiveMaximum: 11,
				enum: [1, 2],
			});
		});
	}

	const lowerNumberTypes = ["number", "integer"] as const;

	for (const type of lowerNumberTypes) {
		it(`lowercase "${type}" drops exclusive bounds but keeps minimum/maximum`, () => {
			expect(
				normalizeJsonSchema({
					type,
					minimum: 1,
					maximum: 10,
					exclusiveMinimum: 0,
					exclusiveMaximum: 11,
					enum: [1, 2],
				}),
			).toEqual({
				type,
				minimum: 1,
				maximum: 10,
				enum: [1, 2],
			});
		});
	}

	it("inferred number from exclusiveMinimum alone keeps the exclusive field", () => {
		expect(normalizeJsonSchema({ exclusiveMinimum: 0 })).toEqual({
			type: Type.INTEGER,
			exclusiveMinimum: 0,
		});
	});

	it("inferred number from exclusiveMaximum + fractional multipleOf stays NUMBER", () => {
		expect(
			normalizeJsonSchema({
				exclusiveMaximum: 1,
				multipleOf: 0.25,
			}),
		).toEqual({
			type: Type.NUMBER,
			exclusiveMaximum: 1,
			multipleOf: 0.25,
		});
	});

	it("lowercase number with only exclusive bounds yields bare typed schema", () => {
		expect(
			normalizeJsonSchema({
				type: "number",
				exclusiveMinimum: 0,
				exclusiveMaximum: 1,
			}),
		).toEqual({ type: "number" });
	});
});
