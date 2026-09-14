import { describe, expect, it } from "vitest";
import { Type } from "@google/genai";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

describe("MCP schema sixth leftover: length + integer multipleOf infer (post #151)", () => {
	it("infers STRING from maxLength alone without type", () => {
		expect(normalizeJsonSchema({ maxLength: 8 })).toEqual({
			type: Type.STRING,
			maxLength: 8,
		});
	});

	it("infers STRING from minLength alone without type", () => {
		expect(normalizeJsonSchema({ minLength: 2 })).toEqual({
			type: Type.STRING,
			minLength: 2,
		});
	});

	it("infers STRING from maxLength 0 (falsy but defined)", () => {
		expect(normalizeJsonSchema({ maxLength: 0 })).toEqual({
			type: Type.STRING,
			maxLength: 0,
		});
	});

	it("infers STRING from minLength 0 (falsy but defined)", () => {
		expect(normalizeJsonSchema({ minLength: 0 })).toEqual({
			type: Type.STRING,
			minLength: 0,
		});
	});

	it("infers STRING when both minLength and maxLength present without type/pattern", () => {
		expect(normalizeJsonSchema({ minLength: 1, maxLength: 10 })).toEqual({
			type: Type.STRING,
			minLength: 1,
			maxLength: 10,
		});
	});

	it("minimum + multipleOf:1 stays INTEGER (integer multipleOf branch)", () => {
		expect(
			normalizeJsonSchema({
				minimum: 0,
				maximum: 100,
				multipleOf: 1,
			}),
		).toEqual({
			type: Type.INTEGER,
			minimum: 0,
			maximum: 100,
			multipleOf: 1,
		});
	});

	it("exclusiveMinimum + multipleOf:2 stays INTEGER", () => {
		expect(
			normalizeJsonSchema({
				exclusiveMinimum: 0,
				multipleOf: 2,
			}),
		).toEqual({
			type: Type.INTEGER,
			exclusiveMinimum: 0,
			multipleOf: 2,
		});
	});

	it("maximum + multipleOf:0.5 remains NUMBER (fractional multipleOf)", () => {
		expect(
			normalizeJsonSchema({
				maximum: 1,
				multipleOf: 0.5,
			}),
		).toEqual({
			type: Type.NUMBER,
			maximum: 1,
			multipleOf: 0.5,
		});
	});

	it("minimum alone without multipleOf defaults to INTEGER", () => {
		expect(normalizeJsonSchema({ minimum: 3 })).toEqual({
			type: Type.INTEGER,
			minimum: 3,
		});
	});
});
