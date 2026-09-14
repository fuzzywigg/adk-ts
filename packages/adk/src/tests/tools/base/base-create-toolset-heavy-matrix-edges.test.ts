import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ReadonlyContext } from "../../../agents/readonly-context";
import { LlmRequest } from "../../../models/llm-request";
import { BaseTool } from "../../../tools/base/base-tool";
import {
	BaseToolset,
	type ToolPredicate,
} from "../../../tools/base/base-toolset";
import { createTool } from "../../../tools/base/create-tool";
import type { ToolContext } from "../../../tools/tool-context";

class StubTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly impl?: (args: Record<string, any>) => Promise<any>,
	) {
		super(config);
	}

	getDeclaration() {
		return {
			name: this.name,
			description: this.description,
			parameters: {
				type: Type.OBJECT,
				properties: {
					query: { type: Type.STRING },
				},
				required: ["query"],
			},
		};
	}

	async runAsync(args: Record<string, any>, _context: ToolContext) {
		if (this.impl) {
			return this.impl(args);
		}
		return { ok: true, args };
	}
}

class MemoryToolset extends BaseToolset {
	constructor(private readonly tools: BaseTool[]) {
		super();
	}

	async getTools(readonlyContext?: ReadonlyContext): Promise<BaseTool[]> {
		if (!readonlyContext) {
			return [...this.tools];
		}
		return this.tools.filter((tool) => tool.name !== "hidden");
	}

	async close(): Promise<void> {
		this.tools.length = 0;
	}
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
	return { actions: {}, ...overrides } as ToolContext;
}

describe("BaseTool/BaseToolset/createTool heavy matrix edges", () => {
	it("BaseTool validates name and description on construction", () => {
		expect(
			() =>
				new StubTool({
					name: "bad-name!",
					description: "valid description",
				}),
		).toThrow(/Invalid tool name/);
		expect(
			() =>
				new StubTool({
					name: "ok_tool",
					description: "no",
				}),
		).toThrow(/too short/);
	});

	it("BaseTool validateArguments logs and returns false when required missing", () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(tool.validateArguments({ query: "x" })).toBe(true);
		expect(tool.validateArguments({})).toBe(false);
		expect(error).toHaveBeenCalled();
	});

	it("BaseTool processLlmRequest dedupes declarations by name", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		const request = new LlmRequest();
		await tool.processLlmRequest(makeContext(), request);
		await tool.processLlmRequest(makeContext(), request);
		expect(request.toolsDict.search_tool).toBe(tool);
		expect(
			(request.config?.tools?.[0] as any).functionDeclarations,
		).toHaveLength(1);
	});

	it("BaseTool safeExecute returns validation failure envelope", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(tool.safeExecute({}, makeContext())).resolves.toEqual({
			error: "Invalid arguments",
			message: "The provided arguments do not match the tool's requirements.",
		});
	});

	it("BaseTool retries failed executions when configured", async () => {
		vi.useFakeTimers();
		let attempts = 0;
		const tool = new StubTool(
			{
				name: "flaky_tool",
				description: "Fails then succeeds",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 2,
			},
			async () => {
				attempts += 1;
				if (attempts < 2) throw new Error("transient");
				return { ok: true };
			},
		);
		tool.baseRetryDelay = 1;
		tool.maxRetryDelay = 1;
		vi.spyOn(console, "error").mockImplementation(() => {});
		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({ result: { ok: true } });
		expect(attempts).toBe(2);
		vi.useRealTimers();
	});

	it("BaseTool returns exhaustion envelope after retries fail", async () => {
		vi.useFakeTimers();
		const tool = new StubTool(
			{
				name: "always_fail",
				description: "Never succeeds",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 1,
			},
			async () => {
				throw new Error("hard fail");
			},
		);
		tool.baseRetryDelay = 1;
		tool.maxRetryDelay = 1;
		vi.spyOn(console, "error").mockImplementation(() => {});
		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({
			error: "Execution failed",
			message: "hard fail",
			tool: "always_fail",
		});
		vi.useRealTimers();
	});

	it("BaseTool skips declaration validation when getDeclaration returns null", async () => {
		class NoDeclTool extends BaseTool {
			getDeclaration() {
				return null;
			}
			async runAsync() {
				return { ok: true };
			}
		}
		const tool = new NoDeclTool({
			name: "no_decl",
			description: "Has no declaration",
		});
		await expect(tool.safeExecute({}, makeContext())).resolves.toEqual({
			result: { ok: true },
		});
	});

	it("BaseTool processLlmRequest no-ops when declaration is null", async () => {
		class NoDeclTool extends BaseTool {
			getDeclaration() {
				return null;
			}
		}
		const tool = new NoDeclTool({
			name: "skip_tool",
			description: "Skips declaration injection",
		});
		const request = new LlmRequest();
		await tool.processLlmRequest(makeContext(), request);
		expect(request.toolsDict).toEqual({});
		expect(request.config?.tools).toBeUndefined();
	});

	it("BaseTool default runAsync throws not implemented", async () => {
		class Abstractish extends BaseTool {
			getDeclaration() {
				return null;
			}
		}
		const tool = new Abstractish({
			name: "abstract_tool",
			description: "Not implemented run",
		});
		await expect(tool.runAsync({}, makeContext())).rejects.toThrow(
			/not implemented/i,
		);
	});

	it("BaseTool honors isLongRunning and retry config defaults", () => {
		const tool = new StubTool({
			name: "cfg_tool",
			description: "Config flags tool",
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 4,
		});
		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(4);
	});

	it("BaseToolset returns all tools when context omitted", async () => {
		const search = { name: "search" } as BaseTool;
		const hidden = { name: "hidden" } as BaseTool;
		const toolset = new MemoryToolset([search, hidden]);
		await expect(toolset.getTools()).resolves.toEqual([search, hidden]);
	});

	it("BaseToolset filters tools using readonly context", async () => {
		const search = { name: "search" } as BaseTool;
		const hidden = { name: "hidden" } as BaseTool;
		const toolset = new MemoryToolset([search, hidden]);
		await expect(toolset.getTools({} as ReadonlyContext)).resolves.toEqual([
			search,
		]);
	});

	it("BaseToolset close releases tools and is idempotent", async () => {
		const search = { name: "search" } as BaseTool;
		const toolset = new MemoryToolset([search]);
		await toolset.close();
		await toolset.close();
		await expect(toolset.getTools()).resolves.toEqual([]);
	});

	it("ToolPredicate supports AND/OR composition", () => {
		const search = { name: "search" } as BaseTool;
		const hidden = { name: "hidden" } as BaseTool;
		const isSearch: ToolPredicate = (tool) => tool.name === "search";
		const notHidden: ToolPredicate = (tool) => tool.name !== "hidden";
		const andPred: ToolPredicate = (tool, ctx) =>
			isSearch(tool, ctx) && notHidden(tool, ctx);
		const orPred: ToolPredicate = (tool, ctx) =>
			isSearch(tool, ctx) || tool.name === "hidden";
		expect(andPred(search)).toBe(true);
		expect(andPred(hidden)).toBe(false);
		expect(orPred(hidden)).toBe(true);
	});

	it("ToolPredicate may consult readonly context role", () => {
		const allowWhenAdmin: ToolPredicate = (tool, ctx) => {
			const role = (ctx as any)?.userContent?.role;
			return role === "admin" || tool.name === "search";
		};
		expect(
			allowWhenAdmin(
				{ name: "hidden" } as BaseTool,
				{ userContent: { role: "admin" } } as any,
			),
		).toBe(true);
		expect(
			allowWhenAdmin(
				{ name: "hidden" } as BaseTool,
				{ userContent: { role: "viewer" } } as any,
			),
		).toBe(false);
	});

	it("getTools returns a shallow copy so callers cannot mutate internals", async () => {
		const search = { name: "search" } as BaseTool;
		const hidden = { name: "hidden" } as BaseTool;
		const toolset = new MemoryToolset([search, hidden]);
		const tools = await toolset.getTools();
		tools.pop();
		await expect(toolset.getTools()).resolves.toEqual([search, hidden]);
	});

	it("createTool validates args with zod and returns results", async () => {
		const tool = createTool({
			name: "add_numbers",
			description: "Adds two numbers",
			schema: z.object({ a: z.number(), b: z.number() }),
			fn: ({ a, b }) => ({ sum: a + b }),
		});
		await expect(tool.runAsync({ a: 2, b: 3 }, makeContext())).resolves.toEqual(
			{ sum: 5 },
		);
	});

	it("createTool returns validation errors for invalid args", async () => {
		const tool = createTool({
			name: "echo_text",
			description: "Echoes text",
			schema: z.object({ text: z.string() }),
			fn: ({ text }) => ({ text }),
		});
		const result = await tool.runAsync({ text: 1 }, makeContext());
		expect(result.error).toContain("Invalid arguments for echo_text");
	});

	it("createTool preserves falsy results and coalesces nullish to {}", async () => {
		const values = [0, false, "", [], {}, null, undefined] as const;
		const results = [];
		for (const [i, value] of values.entries()) {
			const tool = createTool({
				name: `coalesce_${i}`,
				description: "Coalesce matrix",
				fn: () => value as any,
			});
			results.push(await tool.runAsync({}, makeContext()));
		}
		expect(results).toEqual([0, false, "", [], {}, {}, {}]);
	});

	it("createTool applies zod defaults when args omit fields", async () => {
		const tool = createTool({
			name: "defaults_tool",
			description: "Applies zod defaults",
			schema: z.object({
				label: z.string().default("none"),
				n: z.number().default(1),
			}),
			fn: ({ label, n }) => ({ label, n }),
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			label: "none",
			n: 1,
		});
	});

	it("createTool supports nested object and array schemas", () => {
		const tool = createTool({
			name: "nested_schema",
			description: "Handles nested shapes",
			schema: z.object({
				profile: z.object({
					name: z.string(),
					tags: z.array(z.string()),
				}),
			}),
			fn: ({ profile }) => profile,
		});
		expect(
			tool.getDeclaration()?.parameters?.properties?.profile,
		).toBeDefined();
	});

	it("createTool honors isLongRunning and retry options", () => {
		const tool = createTool({
			name: "long_retry",
			description: "Long running with retries",
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 5,
			fn: () => ({ ok: true }),
		});
		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(5);
	});

	it("createTool awaits async fn rejections as error envelope", async () => {
		const tool = createTool({
			name: "async_fail",
			description: "Rejects asynchronously",
			fn: async () => {
				await Promise.resolve();
				throw new Error("async boom");
			},
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toMatchObject({
			error: expect.stringContaining("async boom"),
		});
	});

	it("createTool schema-less tools ignore unknown keys", async () => {
		const tool = createTool({
			name: "freeform",
			description: "No schema validation",
			fn: (args) => ({ keys: Object.keys(args).sort(), args }),
		});
		await expect(
			tool.runAsync({ a: 1, z: true }, makeContext()),
		).resolves.toEqual({ keys: [], args: {} });
	});

	it("createTool safeExecute validates required fields through BaseTool", async () => {
		const tool = createTool({
			name: "safe_create",
			description: "Create tool safe execute",
			schema: z.object({ q: z.string() }),
			fn: ({ q }) => ({ q }),
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const invalid = await tool.safeExecute({}, makeContext());
		expect(invalid).toMatchObject({ error: expect.any(String) });
		const valid = await tool.safeExecute({ q: "hi" }, makeContext());
		expect(valid).toMatchObject({ result: { q: "hi" } });
	});

	it("createTool supports enum and union schemas", async () => {
		const tool = createTool({
			name: "enum_union",
			description: "Enum and union",
			schema: z.object({
				mode: z.enum(["fast", "slow"]),
				id: z.union([z.string(), z.number()]),
			}),
			fn: (args) => args,
		});
		await expect(
			tool.runAsync({ mode: "fast", id: 9 }, makeContext()),
		).resolves.toEqual({ mode: "fast", id: 9 });
		const bad = await tool.runAsync({ mode: "nope", id: true }, makeContext());
		expect(bad.error).toContain("Invalid arguments");
	});

	it("createTool preserves functionCallId from ToolContext", async () => {
		const tool = createTool({
			name: "ctx_id",
			description: "Reads function call id",
			fn: (_args, ctx) => ({ id: (ctx as any).functionCallId }),
		});
		await expect(
			tool.runAsync({}, makeContext({ functionCallId: "fc-42" } as any)),
		).resolves.toEqual({ id: "fc-42" });
	});

	it("BaseTool successful safeExecute wraps result", async () => {
		const tool = new StubTool({
			name: "ok_tool",
			description: "Always succeeds tool",
		});
		await expect(
			tool.safeExecute({ query: "x" }, makeContext()),
		).resolves.toEqual({
			result: { ok: true, args: { query: "x" } },
		});
	});

	it("BaseToolset allows concrete implementations that ignore context", async () => {
		class AlwaysAllToolset extends BaseToolset {
			constructor(private readonly tools: BaseTool[]) {
				super();
			}
			async getTools(_readonlyContext?: ReadonlyContext): Promise<BaseTool[]> {
				return [...this.tools];
			}
			async close(): Promise<void> {}
		}
		const tools = [
			{ name: "search" } as BaseTool,
			{ name: "hidden" } as BaseTool,
		];
		const toolset = new AlwaysAllToolset(tools);
		await expect(toolset.getTools({} as ReadonlyContext)).resolves.toEqual(
			tools,
		);
	});

	it("BaseToolset close may throw for resource failures", async () => {
		class FailingCloseToolset extends BaseToolset {
			async getTools(): Promise<BaseTool[]> {
				return [];
			}
			async close(): Promise<void> {
				throw new Error("close failed");
			}
		}
		await expect(new FailingCloseToolset().close()).rejects.toThrow(
			"close failed",
		);
	});
});
