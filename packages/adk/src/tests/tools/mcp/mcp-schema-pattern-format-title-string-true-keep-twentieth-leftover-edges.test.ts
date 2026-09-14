import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover: typed string `if (schema.pattern)` / `if (schema.format)`
 * and object `if (schema.title)` / `if (schema.description)` — string `"true"`
 * kept (nineteenth pinned `"0"`/`"false"` on pattern/format; thirteenth title
 * `"0"`).
 */
describe("mcp schema pattern/format/title string-true keep twentieth leftover", () => {
	it('typed string pattern/format: "true" kept via truthy if', () => {
		expect(
			normalizeJsonSchema({
				type: "string",
				pattern: "true",
				format: "true",
			}),
		).toEqual({
			type: Type.STRING,
			pattern: "true",
			format: "true",
		});
	});

	it.each([
		"true",
		"false",
	] as const)("object title/description: %j kept via truthy if", (value) => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				title: value,
				description: value,
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
			title: value,
			description: value,
		});
	});

	it("empty title still dropped on object path (eighth/thirteenth control)", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				title: "",
				description: "kept",
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
			description: "kept",
		});
	});
});
