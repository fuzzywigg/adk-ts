import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import {
	adkToMcpToolType,
	declarationToJsonSchema,
	normalizeJsonSchema,
} from "../../../tools/mcp/schema-conversion";
import type { BaseTool } from "../../../tools/base/base-tool";

/**
 * Leftover: determineSchemaType returns Type.* enum values, which then miss
 * the lowercase switch arms — so inference always takes the default branch
 * (no recursive property normalize, extras preserved).
 */
describe("schema-conversion Type-enum inferred default-branch leftover edges", () => {
	it("properties hint → Type.OBJECT default (nested types unchanged)", () => {
		expect(
			normalizeJsonSchema({
				properties: {
					name: { type: "string", minLength: 1 },
					tags: { type: "array", items: { type: "string" }, uniqueItems: true },
				},
				required: ["name"],
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {
				name: { type: "string", minLength: 1 },
				tags: {
					type: "array",
					items: { type: "string" },
					uniqueItems: true,
				},
			},
			required: ["name"],
		});
	});

	it("required-only hint → Type.OBJECT default keeps required", () => {
		expect(
			normalizeJsonSchema({
				required: ["must"],
			}),
		).toEqual({
			type: Type.OBJECT,
			required: ["must"],
		});
	});

	it("items hint → Type.ARRAY default without item recursion", () => {
		expect(
			normalizeJsonSchema({
				items: { type: "number", exclusiveMinimum: 0 },
				maxItems: 4,
			}),
		).toEqual({
			type: Type.ARRAY,
			items: { type: "number", exclusiveMinimum: 0 },
			maxItems: 4,
		});
	});

	it("pattern hint → Type.STRING default preserves pattern", () => {
		expect(normalizeJsonSchema({ pattern: "^[a-z]+$" })).toEqual({
			type: Type.STRING,
			pattern: "^[a-z]+$",
		});
	});

	it("enum object items fall back to Type.STRING via default", () => {
		expect(normalizeJsonSchema({ enum: [{ a: 1 }] })).toEqual({
			type: Type.STRING,
			enum: [{ a: 1 }],
		});
	});

	it("declarationToJsonSchema still prefers .properties over whole bag", () => {
		expect(
			declarationToJsonSchema({
				name: "t",
				description: "d",
				parameters: {
					type: Type.OBJECT,
					properties: { q: { type: Type.STRING } },
					additionalProperties: true,
				},
			}),
		).toEqual({ q: { type: Type.STRING } });
	});

	it("adkToMcpToolType surfaces declaration properties under inputSchema", () => {
		const tool = {
			name: "lookup",
			description: "find",
			getDeclaration: () => ({
				name: "lookup",
				description: "find",
				parameters: {
					type: Type.OBJECT,
					properties: { id: { type: Type.STRING } },
					additionalProperties: true,
				},
			}),
		} as BaseTool;

		expect(adkToMcpToolType(tool)).toEqual({
			name: "lookup",
			description: "find",
			inputSchema: {
				type: "object",
				properties: { id: { type: Type.STRING } },
			},
		});
	});

	it("empty schema with no hints still becomes Type.OBJECT via default", () => {
		expect(normalizeJsonSchema({})).toEqual({ type: Type.OBJECT });
	});
});
