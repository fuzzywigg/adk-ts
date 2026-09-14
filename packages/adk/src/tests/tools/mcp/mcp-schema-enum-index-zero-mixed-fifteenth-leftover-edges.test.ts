import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Fifteenth leftover: enum type inference uses `schema.enum[0]` only.
 * Mixed enums take the first item's typeof even when later items differ.
 */
describe("mcp-schema enum index-zero mixed fifteenth leftover", () => {
	it("first string wins over later numbers", () => {
		expect(normalizeJsonSchema({ enum: ["x", 1, true] })).toEqual({
			type: Type.STRING,
			enum: ["x", 1, true],
		});
	});

	it("first number wins over later strings", () => {
		expect(normalizeJsonSchema({ enum: [2, "y", false] })).toEqual({
			type: Type.NUMBER,
			enum: [2, "y", false],
		});
	});

	it("first boolean wins over later strings", () => {
		expect(normalizeJsonSchema({ enum: [true, "z", 3] })).toEqual({
			type: Type.BOOLEAN,
			enum: [true, "z", 3],
		});
	});

	it("first null falls through default to STRING", () => {
		expect(normalizeJsonSchema({ enum: [null, "a"] })).toEqual({
			type: Type.STRING,
			enum: [null, "a"],
		});
	});

	it("homogeneous string enum still STRING (control)", () => {
		expect(normalizeJsonSchema({ enum: ["a", "b"] })).toEqual({
			type: Type.STRING,
			enum: ["a", "b"],
		});
	});
});
