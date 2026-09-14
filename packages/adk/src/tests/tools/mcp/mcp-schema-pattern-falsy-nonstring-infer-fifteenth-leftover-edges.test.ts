import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Fifteenth leftover: determineSchemaType uses truthy `schema.pattern`.
 * Falsy non-strings (`0`/`false`/`null`) do not infer STRING; `"0"` does
 * (eighth only covered empty-string pattern).
 */
describe("mcp schema pattern falsy-nonstring infer fifteenth leftover", () => {
	it.each([
		0,
		false,
		null,
	] as const)("pattern: %j alone does not infer STRING (falsy hint)", (pattern) => {
		expect(normalizeJsonSchema({ pattern })).toEqual({
			type: Type.OBJECT,
			pattern,
		});
	});

	it('pattern: "0" alone infers STRING (truthy string)', () => {
		expect(normalizeJsonSchema({ pattern: "0" })).toEqual({
			type: Type.STRING,
			pattern: "0",
		});
	});

	it("empty pattern still does not infer STRING (control)", () => {
		expect(normalizeJsonSchema({ pattern: "" })).toEqual({
			type: Type.OBJECT,
			pattern: "",
		});
	});
});
