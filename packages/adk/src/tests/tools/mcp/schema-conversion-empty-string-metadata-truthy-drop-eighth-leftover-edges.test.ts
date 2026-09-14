import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Leftover: normalizeObject/String drop empty title/description/format via
 * truthy `if`, while empty enum/required arrays are kept (truthy arrays).
 */
describe("schema-conversion empty-string metadata truthy-drop eighth leftover edges", () => {
	it("object schema strips empty title/description but keeps required: []", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				title: "",
				description: "",
				required: [],
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
			required: [],
		});
	});

	it("string schema strips empty title/description/format/pattern; keeps enum: []", () => {
		expect(
			normalizeJsonSchema({
				type: "string",
				title: "",
				description: "",
				format: "",
				pattern: "",
				enum: [],
			}),
		).toEqual({
			type: Type.STRING,
			enum: [],
		});
	});

	it("non-empty metadata still preserved (control)", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				title: "T",
				description: "D",
				required: ["a"],
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
			title: "T",
			description: "D",
			required: ["a"],
		});
	});
});
