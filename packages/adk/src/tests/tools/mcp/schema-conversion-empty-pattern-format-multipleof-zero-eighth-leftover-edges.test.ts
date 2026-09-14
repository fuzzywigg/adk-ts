import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Leftover deepen beyond #162 Type-enum + sixth length/multipleOf:
 * empty pattern is falsy (no STRING infer), format alone is not a hint,
 * multipleOf: 0 is an integer multiple (`0 % 1 === 0`).
 */
describe("schema-conversion empty-pattern/format/multipleOf-zero eighth leftover edges", () => {
	it("empty pattern alone does not infer STRING (falsy pattern hint)", () => {
		expect(normalizeJsonSchema({ pattern: "" })).toEqual({
			type: Type.OBJECT,
			pattern: "",
		});
	});

	it("format alone is not an inference hint → Type.OBJECT default", () => {
		expect(normalizeJsonSchema({ format: "email" })).toEqual({
			type: Type.OBJECT,
			format: "email",
		});
	});

	it("minimum + multipleOf: 0 infers INTEGER (0 % 1 === 0)", () => {
		expect(
			normalizeJsonSchema({
				minimum: 0,
				multipleOf: 0,
			}),
		).toEqual({
			type: Type.INTEGER,
			minimum: 0,
			multipleOf: 0,
		});
	});

	it("typed lowercase string drops empty pattern via truthy if", () => {
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

	it("non-empty pattern alone still infers STRING (control)", () => {
		expect(normalizeJsonSchema({ pattern: "^x$" })).toEqual({
			type: Type.STRING,
			pattern: "^x$",
		});
	});
});
