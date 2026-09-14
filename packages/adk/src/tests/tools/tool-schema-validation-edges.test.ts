import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ReadonlyContext } from "../../agents/readonly-context";
import { LlmRequest } from "../../models/llm-request";
import { BaseTool } from "../../tools/base/base-tool";
import { BaseToolset } from "../../tools/base/base-toolset";
import { createTool } from "../../tools/base/create-tool";
import { FunctionTool } from "../../tools/function/function-tool";
import {
	jsonSchemaToDeclaration,
	mcpSchemaToParameters,
	normalizeJsonSchema,
} from "../../tools/mcp/schema-conversion";
import type { ToolContext } from "../../tools/tool-context";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
	return { actions: {}, ...overrides } as ToolContext;
}

class DeclTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly parameters: Record<string, any>,
	) {
		super(config);
	}

	getDeclaration() {
		return {
			name: this.name,
			description: this.description,
			parameters: this.parameters,
		};
	}

	async runAsync(args: Record<string, any>) {
		return { args };
	}
}

class MemoryToolset extends BaseToolset {
	constructor(private readonly tools: BaseTool[]) {
		super();
	}

	async getTools(_readonlyContext?: ReadonlyContext): Promise<BaseTool[]> {
		return [...this.tools];
	}

	async close(): Promise<void> {
		this.tools.length = 0;
	}
}

describe("tool schema validation deepen — invalid required fields", () => {
	it("createTool rejects missing required zod fields without invoking fn", async () => {
		const fn = vi.fn((args: { title: string; count: number }) => args);
		const tool = createTool({
			name: "needs_required",
			description: "Requires title and count",
			schema: z.object({
				title: z.string(),
				count: z.number(),
			}),
			fn,
		});

		const missingBoth = await tool.runAsync({}, makeContext());
		expect(missingBoth.error).toContain("Invalid arguments for needs_required");
		expect(fn).not.toHaveBeenCalled();

		const missingCount = await tool.runAsync({ title: "x" }, makeContext());
		expect(missingCount.error).toContain(
			"Invalid arguments for needs_required",
		);
		expect(fn).not.toHaveBeenCalled();
	});

	it("createTool rejects wrong-typed required fields", async () => {
		const tool = createTool({
			name: "typed_required",
			description: "Typed required fields",
			schema: z.object({
				id: z.string(),
				active: z.boolean(),
			}),
			fn: (args) => args,
		});

		const result = await tool.runAsync(
			{ id: 99, active: "yes" } as any,
			makeContext(),
		);
		expect(result.error).toContain("Invalid arguments for typed_required");
	});

	it("BaseTool.validateArguments fails when any required key is absent", () => {
		const tool = new DeclTool(
			{ name: "multi_req", description: "Needs three fields" },
			{
				type: Type.OBJECT,
				properties: {
					a: { type: Type.STRING },
					b: { type: Type.STRING },
					c: { type: Type.STRING },
				},
				required: ["a", "b", "c"],
			},
		);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		expect(tool.validateArguments({ a: "1", b: "2" })).toBe(false);
		expect(error).toHaveBeenCalledWith(
			'Missing required parameter "c" for tool "multi_req"',
		);
		expect(tool.validateArguments({ a: "1", b: "2", c: "3" })).toBe(true);
		error.mockRestore();
	});

	it("BaseTool treats required keys present as undefined or null as present", () => {
		const tool = new DeclTool(
			{ name: "nullish_req", description: "Nullish still present" },
			{
				type: Type.OBJECT,
				properties: { query: { type: Type.STRING } },
				required: ["query"],
			},
		);

		expect(tool.validateArguments({ query: undefined })).toBe(true);
		expect(tool.validateArguments({ query: null })).toBe(true);
	});

	it("FunctionTool lists all missing mandatory parameters", async () => {
		function pair(left: string, right: string) {
			return { left, right };
		}
		const tool = new FunctionTool(pair, {
			description: "Needs left and right",
		});
		const result = await tool.runAsync({ left: "only" } as any, makeContext());
		expect(result.error).toContain("mandatory input parameters");
		expect(result.error).toContain("right");
		expect(result.error).not.toContain("left");
	});

	it("createTool declaration marks only non-optional zod keys as required", () => {
		const tool = createTool({
			name: "mixed_required",
			description: "Mixed required optional",
			schema: z.object({
				must: z.string(),
				also: z.number(),
				maybe: z.boolean().optional(),
			}),
			fn: (args) => args,
		});
		const parameters = tool.getDeclaration()?.parameters as Record<string, any>;
		expect(parameters.required).toEqual(
			expect.arrayContaining(["must", "also"]),
		);
		expect(parameters.required || []).not.toContain("maybe");
	});
});

describe("tool schema validation deepen — extra properties", () => {
	it("createTool default zod object strips unrecognized keys before fn", async () => {
		let seen: Record<string, unknown> | undefined;
		const tool = createTool({
			name: "strip_extra",
			description: "Strips extras by default",
			schema: z.object({
				name: z.string(),
			}),
			fn: (args) => {
				seen = args as Record<string, unknown>;
				return args;
			},
		});

		const result = await tool.runAsync(
			{ name: "Ada", unused: true, noise: 1 } as any,
			makeContext(),
		);
		expect(result).toEqual({ name: "Ada" });
		expect(seen).toEqual({ name: "Ada" });
		expect(seen).not.toHaveProperty("unused");
	});

	it("createTool strict schemas reject unrecognized keys", async () => {
		const fn = vi.fn((args: { name: string }) => args);
		const tool = createTool({
			name: "strict_extra",
			description: "Rejects extras via strict",
			schema: z
				.object({
					name: z.string(),
				})
				.strict(),
			fn,
		});

		const result = await tool.runAsync(
			{ name: "Ada", unused: true } as any,
			makeContext(),
		);
		expect(result.error).toContain("Invalid arguments for strict_extra");
		expect(fn).not.toHaveBeenCalled();
	});

	it("BaseTool.validateArguments ignores extra properties when required are present", () => {
		const tool = new DeclTool(
			{ name: "extras_ok", description: "Extras allowed" },
			{
				type: Type.OBJECT,
				properties: { query: { type: Type.STRING } },
				required: ["query"],
			},
		);
		expect(
			tool.validateArguments({ query: "x", extra: 1, more: { nested: true } }),
		).toBe(true);
	});

	it("schema-less createTool empty object schema drops all extra keys", async () => {
		const tool = createTool({
			name: "no_schema_extra",
			description: "Empty schema drops keys",
			fn: (args) => ({ keys: Object.keys(args) }),
		});
		await expect(
			tool.runAsync({ a: 1, b: "two" }, makeContext()),
		).resolves.toEqual({ keys: [] });
	});

	it("normalizeJsonSchema infers OBJECT from additionalProperties via Type enum default branch", () => {
		const inferred = normalizeJsonSchema({
			additionalProperties: false,
			required: ["id"],
			properties: {
				id: { type: "string" },
			},
		});
		expect(inferred.type).toBe(Type.OBJECT);
		expect(inferred.required).toEqual(["id"]);
		expect(inferred.additionalProperties).toBe(false);
		expect(inferred.properties?.id).toEqual({ type: "string" });

		const explicit = normalizeJsonSchema({
			type: "object",
			additionalProperties: false,
			required: ["id"],
			properties: {
				id: { type: "string" },
			},
		});
		expect(explicit).toEqual({
			type: Type.OBJECT,
			required: ["id"],
			properties: {
				id: { type: Type.STRING },
			},
		});
		expect(explicit).not.toHaveProperty("additionalProperties");
	});

	it("jsonSchemaToDeclaration preserves additionalProperties on typed schemas", () => {
		const declaration = jsonSchemaToDeclaration("strict_map", "typed extras", {
			type: "object",
			properties: { id: { type: "string" } },
			required: ["id"],
			additionalProperties: false,
		});
		expect(declaration.parameters).toMatchObject({
			type: "object",
			required: ["id"],
			additionalProperties: false,
		});
	});
});

describe("tool schema validation deepen — nested schema edges", () => {
	it("createTool validates nested required object fields", async () => {
		const tool = createTool({
			name: "nested_req",
			description: "Nested required profile",
			schema: z.object({
				profile: z.object({
					name: z.string(),
					age: z.number().int().positive(),
				}),
				tags: z.array(z.string()).min(1),
			}),
			fn: (args) => args,
		});

		const missingNested = await tool.runAsync(
			{ profile: { name: "Ada" }, tags: ["a"] } as any,
			makeContext(),
		);
		expect(missingNested.error).toContain("Invalid arguments for nested_req");

		const emptyTags = await tool.runAsync(
			{ profile: { name: "Ada", age: 30 }, tags: [] },
			makeContext(),
		);
		expect(emptyTags.error).toContain("Invalid arguments for nested_req");

		await expect(
			tool.runAsync(
				{ profile: { name: "Ada", age: 30 }, tags: ["x"] },
				makeContext(),
			),
		).resolves.toEqual({
			profile: { name: "Ada", age: 30 },
			tags: ["x"],
		});
	});

	it("createTool validates arrays of nested objects", async () => {
		const tool = createTool({
			name: "items_nested",
			description: "Array of nested objects",
			schema: z.object({
				items: z.array(
					z.object({
						sku: z.string(),
						qty: z.number().int().positive(),
					}),
				),
			}),
			fn: (args) => args,
		});

		const badItem = await tool.runAsync(
			{ items: [{ sku: "a", qty: 0 }] },
			makeContext(),
		);
		expect(badItem.error).toContain("Invalid arguments for items_nested");

		await expect(
			tool.runAsync({ items: [{ sku: "a", qty: 2 }] }, makeContext()),
		).resolves.toEqual({ items: [{ sku: "a", qty: 2 }] });
	});

	it("normalizeJsonSchema recursively normalizes nested objects and arrays", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				required: ["outer"],
				properties: {
					outer: {
						type: "object",
						required: ["inner"],
						properties: {
							inner: {
								type: "array",
								items: {
									type: "object",
									required: ["id"],
									properties: {
										id: { type: "string", minLength: 1 },
										score: { type: "number", minimum: 0 },
									},
								},
							},
						},
					},
				},
			}),
		).toEqual({
			type: Type.OBJECT,
			required: ["outer"],
			properties: {
				outer: {
					type: Type.OBJECT,
					required: ["inner"],
					properties: {
						inner: {
							type: Type.ARRAY,
							items: {
								type: Type.OBJECT,
								required: ["id"],
								properties: {
									id: { type: Type.STRING, minLength: 1 },
									score: { type: "number", minimum: 0 },
								},
							},
						},
					},
				},
			},
		});
	});

	it("mcpSchemaToParameters keeps nested required arrays on object properties", () => {
		expect(
			mcpSchemaToParameters({
				name: "nested_tool",
				inputSchema: {
					type: "object",
					required: ["payload"],
					properties: {
						payload: {
							type: "object",
							required: ["id"],
							properties: {
								id: { type: "string" },
								meta: {
									type: "object",
									properties: {
										note: { type: "string" },
									},
								},
							},
						},
					},
				},
			} as any),
		).toEqual({
			type: Type.OBJECT,
			required: ["payload"],
			properties: {
				payload: {
					type: Type.OBJECT,
					required: ["id"],
					properties: {
						id: { type: Type.STRING },
						meta: {
							type: Type.OBJECT,
							properties: {
								note: { type: Type.STRING },
							},
						},
					},
				},
			},
		});
	});

	it("createTool nested strict object rejects extras inside nested payload", async () => {
		const tool = createTool({
			name: "nested_strict",
			description: "Nested strict object",
			schema: z.object({
				payload: z
					.object({
						id: z.string(),
					})
					.strict(),
			}),
			fn: (args) => args,
		});

		const result = await tool.runAsync(
			{ payload: { id: "1", sneak: true } } as any,
			makeContext(),
		);
		expect(result.error).toContain("Invalid arguments for nested_strict");
	});

	it("BaseTool.validateArguments only checks top-level required keys, not nested shapes", () => {
		const tool = new DeclTool(
			{ name: "shallow_req", description: "Shallow required only" },
			{
				type: Type.OBJECT,
				properties: {
					profile: {
						type: Type.OBJECT,
						properties: {
							name: { type: Type.STRING },
						},
						required: ["name"],
					},
				},
				required: ["profile"],
			},
		);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		expect(tool.validateArguments({ profile: {} })).toBe(true);
		expect(tool.validateArguments({})).toBe(false);
		error.mockRestore();
	});
});

describe("tool schema validation deepen — empty tool list", () => {
	it("BaseToolset getTools returns empty array when constructed with no tools", async () => {
		const toolset = new MemoryToolset([]);
		await expect(toolset.getTools()).resolves.toEqual([]);
		await expect(toolset.getTools({} as ReadonlyContext)).resolves.toEqual([]);
	});

	it("BaseToolset close on an already-empty list stays empty", async () => {
		const toolset = new MemoryToolset([]);
		await toolset.close();
		await expect(toolset.getTools()).resolves.toEqual([]);
	});

	it("processLlmRequest with empty tools array still appends a declaration entry", async () => {
		const tool = new DeclTool(
			{ name: "solo_tool", description: "Only tool" },
			{
				type: Type.OBJECT,
				properties: {},
			},
		);
		const request = new LlmRequest({
			config: {
				tools: [],
			},
		});

		await tool.processLlmRequest(makeContext(), request);

		expect(request.config?.tools).toHaveLength(1);
		expect(
			(request.config?.tools?.[0] as any).functionDeclarations[0].name,
		).toBe("solo_tool");
		expect(request.toolsDict.solo_tool).toBe(tool);
	});

	it("mcpSchemaToParameters returns empty object schema when MCP tool has no schema", () => {
		expect(mcpSchemaToParameters({ name: "bare" } as any)).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("createTool empty object schema declares an empty properties object", () => {
		const tool = createTool({
			name: "empty_params",
			description: "No parameters",
			fn: () => ({ ok: true }),
		});
		const parameters = tool.getDeclaration()?.parameters as Record<string, any>;
		expect(parameters.type).toBe("object");
		expect(parameters.properties).toEqual({});
		expect(parameters.required ?? []).toEqual([]);
	});

	it("safeExecute with empty args fails when declaration requires fields", async () => {
		const tool = new DeclTool(
			{ name: "needs_q", description: "Requires query" },
			{
				type: Type.OBJECT,
				properties: { query: { type: Type.STRING } },
				required: ["query"],
			},
		);
		vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(tool.safeExecute({}, makeContext())).resolves.toEqual({
			error: "Invalid arguments",
			message: "The provided arguments do not match the tool's requirements.",
		});
	});
});
