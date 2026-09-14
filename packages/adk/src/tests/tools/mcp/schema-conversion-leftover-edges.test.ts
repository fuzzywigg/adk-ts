import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";
import {
	adkToMcpToolType,
	declarationToJsonSchema,
	jsonSchemaToDeclaration,
	mcpSchemaToParameters,
	normalizeJsonSchema,
} from "../../../tools/mcp/schema-conversion";

class StubTool extends BaseTool {
	constructor(
		name: string,
		description: string,
		private readonly declaration: ReturnType<BaseTool["getDeclaration"]>,
	) {
		super({ name, description });
	}

	getDeclaration() {
		return this.declaration;
	}

	async runAsync(_args: Record<string, any>, _context: ToolContext) {
		return {};
	}
}

describe("schema-conversion leftover edges (overnight TOKENMAXX post #150)", () => {
	it("declarationToJsonSchema returns {} when parameters missing", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				description: "d",
			}),
		).toEqual({});
	});

	it("declarationToJsonSchema returns whole parameters when properties absent", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				description: "d",
				parameters: { type: Type.STRING, enum: ["a", "b"] } as any,
			}),
		).toEqual({ type: Type.STRING, enum: ["a", "b"] });
	});

	it("jsonSchemaToDeclaration wraps bare maps and defaults undefined schema", () => {
		expect(
			jsonSchemaToDeclaration("wrap", "desc", { a: { type: "string" } }),
		).toEqual({
			name: "wrap",
			description: "desc",
			parameters: {
				type: Type.OBJECT,
				properties: { a: { type: "string" } },
			},
		});

		expect(jsonSchemaToDeclaration("empty", "d", undefined)).toEqual({
			name: "empty",
			description: "d",
			parameters: { type: Type.OBJECT, properties: {} },
		});
	});

	it("jsonSchemaToDeclaration preserves already-typed schema objects", () => {
		const schema = {
			type: "object",
			properties: { n: { type: "number" } },
			required: ["n"],
		};
		expect(jsonSchemaToDeclaration("typed", "d", schema)).toEqual({
			name: "typed",
			description: "d",
			parameters: schema,
		});
	});

	it("normalizeJsonSchema nullish input becomes empty object schema", () => {
		expect(normalizeJsonSchema(null as any)).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
		expect(normalizeJsonSchema(undefined as any)).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("infers STRING for empty enum list and BOOLEAN/NUMBER from first enum item", () => {
		expect(normalizeJsonSchema({ enum: [] })).toEqual({
			type: Type.STRING,
			enum: [],
		});
		expect(normalizeJsonSchema({ enum: [true, false] })).toEqual({
			type: Type.BOOLEAN,
			enum: [true, false],
		});
		expect(normalizeJsonSchema({ enum: [1, 2] })).toEqual({
			type: Type.NUMBER,
			enum: [1, 2],
		});
		expect(normalizeJsonSchema({ enum: [{ x: 1 }] })).toEqual({
			type: Type.STRING,
			enum: [{ x: 1 }],
		});
	});

	it("infers INTEGER when multipleOf is whole and NUMBER when fractional", () => {
		expect(
			normalizeJsonSchema({ minimum: 0, maximum: 10, multipleOf: 2 }),
		).toEqual({
			type: Type.INTEGER,
			minimum: 0,
			maximum: 10,
			multipleOf: 2,
		});
		expect(
			normalizeJsonSchema({ minimum: 0, maximum: 1, multipleOf: 0.5 }),
		).toEqual({
			type: Type.NUMBER,
			minimum: 0,
			maximum: 1,
			multipleOf: 0.5,
		});
	});

	it("infers STRING from pattern/minLength/maxLength without explicit type", () => {
		expect(normalizeJsonSchema({ pattern: "^[a-z]+$" })).toEqual({
			type: Type.STRING,
			pattern: "^[a-z]+$",
		});
		expect(normalizeJsonSchema({ minLength: 1, maxLength: 3 })).toEqual({
			type: Type.STRING,
			minLength: 1,
			maxLength: 3,
		});
	});

	it("normalizeNumberSchema keeps lowercase type and drops exclusive bounds", () => {
		expect(
			normalizeJsonSchema({
				type: "number",
				exclusiveMinimum: 1,
				exclusiveMaximum: 9,
				minimum: 0,
			}),
		).toEqual({
			type: "number",
			minimum: 0,
		});
	});

	it("passes through unknown explicit types unchanged", () => {
		expect(normalizeJsonSchema({ type: "custom-type", foo: 1 } as any)).toEqual(
			{
				type: "custom-type",
				foo: 1,
			},
		);
	});

	it("mcpSchemaToParameters prefers inputSchema then parameters fallback", () => {
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
			properties: { q: { type: Type.STRING } },
		});

		expect(
			mcpSchemaToParameters({
				name: "t",
				parameters: {
					type: "object",
					properties: { n: { type: "number" } },
				},
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: { n: { type: "number" } },
		});

		expect(mcpSchemaToParameters({ name: "t" } as any)).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("adkToMcpToolType uses empty description override and nested property map", () => {
		const tool = new StubTool("search", "Search things online", {
			name: "search",
			description: "Search things online",
			parameters: {
				type: Type.OBJECT,
				properties: {
					query: { type: Type.STRING },
				},
			},
		});
		tool.description = "";
		expect(adkToMcpToolType(tool)).toEqual({
			name: "search",
			description: "",
			inputSchema: {
				type: "object",
				properties: {
					query: { type: Type.STRING },
				},
			},
		});
	});

	it("normalizes nested object required/title/description metadata", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				title: "Root",
				description: "Root desc",
				required: ["a"],
				properties: {
					a: {
						type: "array",
						title: "A",
						description: "Arr",
						minItems: 1,
						maxItems: 2,
						items: { type: "string", format: "email" },
					},
				},
			}),
		).toEqual({
			type: Type.OBJECT,
			title: "Root",
			description: "Root desc",
			required: ["a"],
			properties: {
				a: {
					type: Type.ARRAY,
					title: "A",
					description: "Arr",
					minItems: 1,
					maxItems: 2,
					items: {
						type: Type.STRING,
						format: "email",
					},
				},
			},
		});
	});

	it("infers OBJECT from additionalProperties without copying the flag away", () => {
		expect(normalizeJsonSchema({ additionalProperties: true })).toEqual({
			additionalProperties: true,
			type: Type.OBJECT,
		});
	});
});
