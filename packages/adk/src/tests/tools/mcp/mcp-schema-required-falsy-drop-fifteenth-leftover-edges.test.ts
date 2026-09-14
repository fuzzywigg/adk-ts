import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Fifteenth leftover: `if (schema.required)` drops falsy required (false/0);
 * empty array [] is truthy and kept (thirteenth).
 */
describe("mcp schema required falsy drop fifteenth leftover", () => {
	it.each([
		false,
		0,
		"",
	] as const)("required %j is dropped from normalized object schema", (required) => {
		const out = normalizeJsonSchema({
			type: "object",
			properties: {},
			required: required as any,
		});
		expect(out).not.toHaveProperty("required");
	});

	it("required: [] is truthy and kept (control)", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				required: [],
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
			required: [],
		});
	});

	it('required: ["a"] still kept (control)', () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: { a: { type: "string" } },
				required: ["a"],
			}).required,
		).toEqual(["a"]);
	});
});
