import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Fifteenth leftover: enum first-item typeof — null/{} miss string/number/
 * boolean arms and fall through to STRING default.
 */
describe("mcp schema enum null first-item fifteenth leftover", () => {
	it.each([
		{ label: "[null]", enumValues: [null] },
		{ label: "[{}]", enumValues: [{}] },
		{ label: "[[]]", enumValues: [[]] },
	] as const)("enum $label infers Type.STRING via default branch", ({
		enumValues,
	}) => {
		expect(normalizeJsonSchema({ enum: enumValues as any })).toEqual({
			type: Type.STRING,
			enum: enumValues,
		});
	});

	it("enum [1] still infers NUMBER (control)", () => {
		expect(normalizeJsonSchema({ enum: [1] })).toEqual({
			type: Type.NUMBER,
			enum: [1],
		});
	});

	it('enum ["a"] still infers STRING (control)', () => {
		expect(normalizeJsonSchema({ enum: ["a"] })).toEqual({
			type: Type.STRING,
			enum: ["a"],
		});
	});
});
