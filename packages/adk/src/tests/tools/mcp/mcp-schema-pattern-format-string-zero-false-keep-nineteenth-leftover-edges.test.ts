import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Nineteenth leftover: typed string path `if (schema.pattern)` / `if (schema.format)`
 * — string "0"/"false" are truthy and kept (eighth already drops empty pattern).
 */
describe("mcp schema pattern/format string-zero/false keep nineteenth leftover", () => {
	it.each([
		"0",
		"false",
	] as const)("typed string pattern: %j kept via truthy if", (pattern) => {
		expect(
			normalizeJsonSchema({
				type: "string",
				pattern,
			}),
		).toEqual({
			type: Type.STRING,
			pattern,
		});
	});

	it.each([
		"0",
		"false",
	] as const)("typed string format: %j kept via truthy if", (format) => {
		expect(
			normalizeJsonSchema({
				type: "string",
				format,
			}),
		).toEqual({
			type: Type.STRING,
			format,
		});
	});

	it("empty pattern still dropped on typed string path (eighth control)", () => {
		expect(
			normalizeJsonSchema({
				type: "string",
				pattern: "",
				format: "uuid",
			}),
		).toEqual({
			type: Type.STRING,
			format: "uuid",
		});
	});
});
