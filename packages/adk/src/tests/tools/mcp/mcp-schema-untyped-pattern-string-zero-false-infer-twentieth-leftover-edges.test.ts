import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover: untyped `determineSchemaType` uses `if (schema.pattern)`
 * — string "0"/"false" infer STRING and keep pattern; empty pattern does not.
 */
describe("mcp schema untyped pattern string-zero/false infer twentieth leftover", () => {
	it.each([
		"0",
		"false",
	] as const)("pattern: %j alone → STRING + keep", (pattern) => {
		expect(
			normalizeJsonSchema({
				pattern,
			}),
		).toEqual({
			type: Type.STRING,
			pattern,
		});
	});

	it('pattern: "" still no STRING infer; empty pattern retained (eighth control)', () => {
		expect(
			normalizeJsonSchema({
				pattern: "",
			}),
		).toEqual({
			type: Type.OBJECT,
			pattern: "",
		});
	});

	it("typed string path still keeps pattern (nineteenth control)", () => {
		expect(
			normalizeJsonSchema({
				type: "string",
				pattern: "0",
			}),
		).toEqual({
			type: Type.STRING,
			pattern: "0",
		});
	});
});
