import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import {
	declarationToJsonSchema,
	jsonSchemaToDeclaration,
	normalizeJsonSchema,
} from "../../../tools/mcp/schema-conversion";

describe("schema-conversion", () => {
	it("returns empty object when declaration has no parameters", () => {
		expect(declarationToJsonSchema({ name: "noop", description: "" })).toEqual(
			{},
		);
	});

	it("returns properties when present on declaration parameters", () => {
		expect(
			declarationToJsonSchema({
				name: "tool",
				description: "d",
				parameters: {
					type: Type.OBJECT,
					properties: { q: { type: Type.STRING } },
				},
			}),
		).toEqual({ q: { type: Type.STRING } });
	});

	it("wraps bare property maps when converting mcp schema to declarations", () => {
		const declaration = jsonSchemaToDeclaration("search", "find things", {
			query: { type: "string" },
		});
		expect(declaration.name).toBe("search");
		expect(declaration.description).toBe("find things");
		expect(declaration.parameters).toEqual({
			type: Type.OBJECT,
			properties: { query: { type: "string" } },
		});
	});

	it("preserves already-typed schemas and defaults missing schemas", () => {
		expect(
			jsonSchemaToDeclaration("typed", "d", {
				type: "object",
				properties: { a: { type: "number" } },
			}).parameters,
		).toEqual({
			type: "object",
			properties: { a: { type: "number" } },
		});

		expect(jsonSchemaToDeclaration("empty", "d", undefined).parameters).toEqual(
			{
				type: Type.OBJECT,
				properties: {},
			},
		);
	});

	it("normalizes object, array, and inferred schemas", () => {
		// When type is inferred via Type enum values, nested property shapes are
		// preserved as provided because switch matching is lowercase-only.
		expect(
			normalizeJsonSchema({
				properties: {
					name: { type: "string", minLength: 1 },
					tags: { type: "array", items: { type: "string" } },
				},
				required: ["name"],
			}),
		).toEqual({
			type: Type.OBJECT,
			required: ["name"],
			properties: {
				name: { type: "string", minLength: 1 },
				tags: { type: "array", items: { type: "string" } },
			},
		});

		expect(normalizeJsonSchema({ items: { type: "number" } })).toEqual({
			type: Type.ARRAY,
			items: { type: "number" },
		});

		expect(normalizeJsonSchema({ type: "string", minLength: 2 })).toEqual({
			type: Type.STRING,
			minLength: 2,
		});

		expect(normalizeJsonSchema(null as any)).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});
});
