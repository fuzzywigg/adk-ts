import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import {
	adkToMcpToolType,
	declarationToJsonSchema,
	jsonSchemaToDeclaration,
	mcpSchemaToParameters,
	normalizeJsonSchema,
} from "../../../tools/mcp/schema-conversion";
import type { BaseTool } from "../../../tools/base/base-tool";

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

	it("returns whole parameters object when properties are absent", () => {
		expect(
			declarationToJsonSchema({
				name: "tool",
				description: "d",
				parameters: {
					type: Type.OBJECT,
					required: ["q"],
				} as any,
			}),
		).toEqual({
			type: Type.OBJECT,
			required: ["q"],
		});
	});

	it("converts ADK tools to MCP tool type", () => {
		const tool = {
			name: "lookup",
			description: "find things",
			getDeclaration: () => ({
				name: "lookup",
				description: "find things",
				parameters: {
					type: Type.OBJECT,
					properties: { id: { type: Type.STRING } },
				},
			}),
		} as BaseTool;

		expect(adkToMcpToolType(tool)).toEqual({
			name: "lookup",
			description: "find things",
			inputSchema: {
				type: "object",
				properties: { id: { type: Type.STRING } },
			},
		});
	});

	it("normalizes boolean/null/number schemas and enum inference", () => {
		expect(normalizeJsonSchema({ type: "boolean" })).toEqual({
			type: Type.BOOLEAN,
		});
		expect(normalizeJsonSchema({ type: "null" })).toEqual({
			type: Type.NULL,
		});
		expect(
			normalizeJsonSchema({ type: "integer", minimum: 1, maximum: 5 }),
		).toEqual({
			type: "integer",
			minimum: 1,
			maximum: 5,
		});
		expect(normalizeJsonSchema({ enum: ["a", "b"] })).toEqual({
			type: Type.STRING,
			enum: ["a", "b"],
		});
		expect(normalizeJsonSchema({ enum: [1, 2] })).toEqual({
			type: Type.NUMBER,
			enum: [1, 2],
		});
	});

	it("maps mcp inputSchema and parameters fallbacks", () => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				inputSchema: {
					type: "object",
					properties: { q: { type: "string" } },
				},
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: {
				q: { type: Type.STRING },
			},
		});

		expect(
			mcpSchemaToParameters({
				name: "t",
				parameters: { type: "object", properties: {} },
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
		});

		expect(mcpSchemaToParameters({ name: "empty" } as any)).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("infers schema types from structural hints", () => {
		expect(
			normalizeJsonSchema({
				additionalProperties: false,
				required: ["id"],
			}),
		).toMatchObject({ type: Type.OBJECT, required: ["id"] });

		expect(normalizeJsonSchema({ pattern: "^[a-z]+$" })).toEqual({
			type: Type.STRING,
			pattern: "^[a-z]+$",
		});

		expect(normalizeJsonSchema({ minimum: 1, maximum: 3 })).toEqual({
			type: Type.INTEGER,
			minimum: 1,
			maximum: 3,
		});

		expect(
			normalizeJsonSchema({
				minimum: 0,
				maximum: 1,
				multipleOf: 0.5,
			}),
		).toEqual({
			type: Type.NUMBER,
			minimum: 0,
			maximum: 1,
			multipleOf: 0.5,
		});

		expect(normalizeJsonSchema({ enum: [] })).toEqual({
			type: Type.STRING,
			enum: [],
		});
		expect(normalizeJsonSchema({ enum: [true, false] })).toEqual({
			type: Type.BOOLEAN,
			enum: [true, false],
		});
		expect(normalizeJsonSchema({ enum: [{ a: 1 }] })).toEqual({
			type: Type.STRING,
			enum: [{ a: 1 }],
		});
	});

	it("preserves string/array metadata during normalize", () => {
		expect(
			normalizeJsonSchema({
				type: "string",
				minLength: 1,
				maxLength: 4,
				pattern: "x+",
				format: "email",
				enum: ["a"],
				title: "t",
				description: "d",
			}),
		).toEqual({
			type: Type.STRING,
			minLength: 1,
			maxLength: 4,
			pattern: "x+",
			format: "email",
			enum: ["a"],
			title: "t",
			description: "d",
		});

		expect(
			normalizeJsonSchema({
				type: "array",
				items: { type: "string" },
				minItems: 1,
				maxItems: 3,
				title: "list",
				description: "items",
			}),
		).toEqual({
			type: Type.ARRAY,
			items: { type: Type.STRING },
			minItems: 1,
			maxItems: 3,
			title: "list",
			description: "items",
		});

		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {
					nested: {
						type: "object",
						properties: { n: { type: "number" } },
					},
				},
				title: "obj",
				description: "desc",
			}),
		).toEqual({
			type: Type.OBJECT,
			title: "obj",
			description: "desc",
			properties: {
				nested: {
					type: Type.OBJECT,
					properties: {
						n: { type: "number" },
					},
				},
			},
		});
	});

	it("infers number types from exclusiveMinimum/exclusiveMaximum alone", () => {
		expect(normalizeJsonSchema({ exclusiveMinimum: 0 })).toEqual({
			type: Type.INTEGER,
			exclusiveMinimum: 0,
		});
		expect(
			normalizeJsonSchema({ exclusiveMaximum: 1, multipleOf: 0.25 }),
		).toEqual({
			type: Type.NUMBER,
			exclusiveMaximum: 1,
			multipleOf: 0.25,
		});
	});

	it("passes through unknown explicit types unchanged during normalize", () => {
		expect(normalizeJsonSchema({ type: "custom-type", title: "x" })).toEqual({
			type: "custom-type",
			title: "x",
		});
	});

	it("infers OBJECT when schema only has a description hint", () => {
		expect(normalizeJsonSchema({ description: "opaque blob" })).toEqual({
			type: Type.OBJECT,
			description: "opaque blob",
		});
	});

	it("infers OBJECT for empty schemas with no structural hints", () => {
		expect(normalizeJsonSchema({})).toEqual({
			type: Type.OBJECT,
		});
	});

	it("normalizes number schemas with enum, title, and description", () => {
		expect(
			normalizeJsonSchema({
				type: "number",
				minimum: 0,
				maximum: 10,
				enum: [1, 2, 3],
				title: "score",
				description: "numeric score choices",
			}),
		).toEqual({
			type: "number",
			minimum: 0,
			maximum: 10,
			enum: [1, 2, 3],
			title: "score",
			description: "numeric score choices",
		});

		expect(
			normalizeJsonSchema({
				type: "integer",
				enum: [0, 1],
				title: "flag",
				description: "binary flag",
			}),
		).toEqual({
			type: "integer",
			enum: [0, 1],
			title: "flag",
			description: "binary flag",
		});
	});

	it("adkToMcpToolType uses empty string when tool.description is falsy", () => {
		const emptyDesc = {
			name: "noop",
			description: "",
			getDeclaration: () => ({
				name: "noop",
				description: "",
				parameters: { type: Type.OBJECT, properties: {} },
			}),
		} as BaseTool;

		expect(adkToMcpToolType(emptyDesc)).toEqual({
			name: "noop",
			description: "",
			inputSchema: {
				type: "object",
				properties: {},
			},
		});

		const undefinedDesc = {
			name: "blank",
			description: undefined,
			getDeclaration: () => ({
				name: "blank",
				description: undefined,
			}),
		} as unknown as BaseTool;

		expect(adkToMcpToolType(undefinedDesc).description).toBe("");
	});

	it("preserves number exclusive bounds only when present on typed number schemas", () => {
		expect(
			normalizeJsonSchema({
				type: "number",
				minimum: 1.5,
				maximum: 9.5,
				title: "range",
				description: "float range",
			}),
		).toEqual({
			type: "number",
			minimum: 1.5,
			maximum: 9.5,
			title: "range",
			description: "float range",
		});
	});

	it("mcpSchemaToParameters normalizes nested number property metadata", () => {
		expect(
			mcpSchemaToParameters({
				name: "score_tool",
				inputSchema: {
					type: "object",
					properties: {
						score: {
							type: "number",
							enum: [1, 2, 3],
							title: "Score",
							description: "Pick a score",
						},
					},
				},
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: {
				score: {
					type: "number",
					enum: [1, 2, 3],
					title: "Score",
					description: "Pick a score",
				},
			},
		});
	});
});

describe("schema-conversion leftover null/dual-schema edges", () => {
	it("adkToMcpToolType throws when getDeclaration returns null", () => {
		const tool = {
			name: "null_decl",
			description: "declaration is null",
			getDeclaration: () => null,
		} as unknown as BaseTool;

		expect(() => adkToMcpToolType(tool)).toThrow();
	});

	it("mcpSchemaToParameters prefers inputSchema when parameters also exist", () => {
		expect(
			mcpSchemaToParameters({
				name: "dual",
				inputSchema: {
					type: "object",
					properties: { fromInput: { type: "string" } },
				},
				parameters: {
					type: "object",
					properties: { fromParams: { type: "number" } },
				},
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: {
				fromInput: { type: Type.STRING },
			},
		});
	});

	it("declarationToJsonSchema returns empty object for nullish parameters", () => {
		expect(
			declarationToJsonSchema({
				name: "x",
				description: "d",
				parameters: null as any,
			}),
		).toEqual({});
		expect(
			declarationToJsonSchema({
				name: "x",
				description: "d",
				parameters: undefined,
			}),
		).toEqual({});
	});
});
