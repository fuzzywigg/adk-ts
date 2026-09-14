import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Fifteenth leftover: array minItems/maxItems use `!== undefined` so numeric
 * 0 is kept (unlike truthiness gates elsewhere).
 */
describe("mcp schema array minItems zero keep fifteenth leftover", () => {
	it("keeps minItems: 0 and maxItems: 0 on array schema", () => {
		expect(
			normalizeJsonSchema({
				type: "array",
				items: { type: "string" },
				minItems: 0,
				maxItems: 0,
			}),
		).toEqual({
			type: Type.ARRAY,
			items: { type: Type.STRING },
			minItems: 0,
			maxItems: 0,
		});
	});

	it("omits minItems when undefined (control)", () => {
		const out = normalizeJsonSchema({
			type: "array",
			items: { type: "number" },
		});
		expect(out).not.toHaveProperty("minItems");
		expect(out).not.toHaveProperty("maxItems");
	});
});
