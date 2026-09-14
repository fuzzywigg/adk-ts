import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Leftover: lowercase "number"/"integer" keep the lowercase type string from
 * the input (normalizeNumberSchema uses schema.type as Type). Type.NUMBER /
 * Type.INTEGER keep the uppercase enum string via the default branch, and
 * also preserve exclusive bounds that lowercase drops.
 */
describe("schema-conversion Type-enum number/integer string asymmetry leftover edges", () => {
	it("Type.NUMBER keeps uppercase type and exclusive bounds", () => {
		expect(
			normalizeJsonSchema({
				type: Type.NUMBER,
				minimum: 0,
				maximum: 1,
				exclusiveMinimum: -1,
				title: "score",
				description: "unit interval",
			}),
		).toEqual({
			type: Type.NUMBER,
			minimum: 0,
			maximum: 1,
			exclusiveMinimum: -1,
			title: "score",
			description: "unit interval",
		});
	});

	it('lowercase "number" keeps lowercase type string and drops exclusives', () => {
		expect(
			normalizeJsonSchema({
				type: "number",
				minimum: 0,
				maximum: 1,
				exclusiveMinimum: -1,
				title: "score",
				description: "unit interval",
			}),
		).toEqual({
			type: "number",
			minimum: 0,
			maximum: 1,
			title: "score",
			description: "unit interval",
		});
	});

	it("Type.INTEGER keeps uppercase type and exclusiveMaximum", () => {
		expect(
			normalizeJsonSchema({
				type: Type.INTEGER,
				minimum: 0,
				exclusiveMaximum: 5,
				enum: [1, 2],
			}),
		).toEqual({
			type: Type.INTEGER,
			minimum: 0,
			exclusiveMaximum: 5,
			enum: [1, 2],
		});
	});

	it('lowercase "integer" keeps lowercase type and drops exclusiveMaximum', () => {
		expect(
			normalizeJsonSchema({
				type: "integer",
				minimum: 0,
				exclusiveMaximum: 5,
				enum: [1, 2],
			}),
		).toEqual({
			type: "integer",
			minimum: 0,
			enum: [1, 2],
		});
	});

	it("NUMBER/INTEGER string literals behave like Type enum (default branch)", () => {
		expect(
			normalizeJsonSchema({
				type: "NUMBER",
				exclusiveMinimum: 0,
			}),
		).toEqual({ type: "NUMBER", exclusiveMinimum: 0 });
		expect(
			normalizeJsonSchema({
				type: "INTEGER",
				exclusiveMaximum: 3,
			}),
		).toEqual({ type: "INTEGER", exclusiveMaximum: 3 });
	});

	it("side-by-side matrix: enum vs lowercase type string identity", () => {
		const enumOut = normalizeJsonSchema({
			type: Type.NUMBER,
			maximum: 9,
		});
		const lowerOut = normalizeJsonSchema({
			type: "number",
			maximum: 9,
		});
		expect(enumOut.type).toBe(Type.NUMBER);
		expect(lowerOut.type).toBe("number");
		expect(enumOut.type).not.toBe(lowerOut.type);
		expect(enumOut.maximum).toBe(lowerOut.maximum);
	});
});
