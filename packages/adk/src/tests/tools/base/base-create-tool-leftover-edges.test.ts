import { Type } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmRequest } from "../../../models/llm-request";
import { BaseTool } from "../../../tools/base/base-tool";
import { createTool } from "../../../tools/base/create-tool";
import type { ToolContext } from "../../../tools/tool-context";

class StubTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly impl?: (args: Record<string, any>) => Promise<any>,
		private readonly declaration?: ReturnType<BaseTool["getDeclaration"]>,
	) {
		super(config);
	}

	getDeclaration() {
		if (this.declaration !== undefined) {
			return this.declaration;
		}
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

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("BaseTool + createTool leftover edges (overnight TOKENMAXX post #150)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("accepts underscore-only and leading-underscore names", () => {
		const onlyUnderscores = new StubTool({
			name: "___",
			description: "Valid underscore name",
		});
		expect(onlyUnderscores.name).toBe("___");

		const leading = new StubTool({
			name: "_leading",
			description: "Leading underscore ok",
		});
		expect(leading.name).toBe("_leading");
	});

	it("rejects description that is only whitespace padded under length 3", () => {
		expect(
			() =>
				new StubTool({
					name: "short_desc",
					description: "  ",
				}),
		).toThrow(/too short/);
	});

	it("validateArguments returns true when declaration parameters are missing", () => {
		const tool = new StubTool(
			{ name: "no_params", description: "No parameter schema" },
			undefined,
			{ name: "no_params", description: "No parameter schema" },
		);
		expect(tool.validateArguments({})).toBe(true);
	});

	it("processLlmRequest skips when getDeclaration returns null", async () => {
		const tool = new StubTool(
			{ name: "null_decl", description: "Null declaration tool" },
			undefined,
			null,
		);
		const req = new LlmRequest();
		await tool.processLlmRequest(makeContext(), req);
		expect(req.toolsDict.null_decl).toBeUndefined();
		expect(req.config?.tools).toBeUndefined();
	});

	it("processLlmRequest dedupes when functionDeclarations already contains name", async () => {
		const tool = new StubTool({
			name: "dup_tool",
			description: "Dedupes declarations",
		});
		const req = new LlmRequest({
			config: {
				tools: [
					{
						functionDeclarations: [
							{
								name: "dup_tool",
								description: "already there",
								parameters: { type: Type.OBJECT, properties: {} },
							},
						],
					},
				],
			},
		});
		await tool.processLlmRequest(makeContext(), req);
		expect(req.config?.tools?.[0].functionDeclarations).toHaveLength(1);
		expect(req.toolsDict.dup_tool).toBe(tool);
	});

	it("processLlmRequest appends to existing functionDeclarations list", async () => {
		const tool = new StubTool({
			name: "append_tool",
			description: "Appends a declaration",
		});
		const req = new LlmRequest({
			config: {
				tools: [
					{
						functionDeclarations: [
							{
								name: "prior",
								description: "first",
								parameters: { type: Type.OBJECT, properties: {} },
							},
						],
					},
				],
			},
		});
		await tool.processLlmRequest(makeContext(), req);
		expect(
			req.config?.tools?.[0].functionDeclarations?.map((d) => d.name),
		).toEqual(["prior", "append_tool"]);
	});

	it("maxRetryAttempts 0 is coerced to default 3 via || in BaseTool constructor", async () => {
		const impl = vi.fn().mockRejectedValue(new Error("boom"));
		const tool = new StubTool(
			{
				name: "zero_retry",
				description: "Zero retry attempts coerce",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 0,
			},
			impl,
		);
		expect(tool.maxRetryAttempts).toBe(3);
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		const delays: number[] = [];
		const realSetTimeout = globalThis.setTimeout;
		vi.spyOn(globalThis, "setTimeout").mockImplementation(((
			handler: TimerHandler,
			timeout?: number,
			...args: any[]
		) => {
			delays.push(timeout ?? 0);
			return realSetTimeout(handler as any, 0, ...args);
		}) as any);

		const result = await tool.safeExecute({ query: "x" }, makeContext());
		expect(impl).toHaveBeenCalledTimes(4);
		expect(delays).toHaveLength(3);
		expect(result).toEqual({
			error: "Execution failed",
			message: "boom",
			tool: "zero_retry",
		});
	});

	it("safeExecute without retry does not schedule backoff delays", async () => {
		const delays: number[] = [];
		const realSetTimeout = globalThis.setTimeout;
		vi.spyOn(globalThis, "setTimeout").mockImplementation(((
			handler: TimerHandler,
			timeout?: number,
			...args: any[]
		) => {
			delays.push(timeout ?? 0);
			return realSetTimeout(handler as any, 0, ...args);
		}) as any);

		const tool = new StubTool(
			{
				name: "no_retry",
				description: "No retry path",
				shouldRetryOnFailure: false,
			},
			async () => {
				throw new Error("once");
			},
		);
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		await tool.safeExecute({ query: "x" }, makeContext());
		expect(delays).toEqual([]);
	});

	it("createTool omitted schema builds empty-object declaration parameters", () => {
		const tool = createTool({
			name: "no_schema",
			description: "Uses default empty schema",
			fn: () => ({ ok: true }),
		});
		const declaration = tool.getDeclaration();
		expect(declaration?.name).toBe("no_schema");
		expect(declaration?.parameters).toEqual(
			expect.objectContaining({
				type: "object",
				properties: {},
			}),
		);
		expect((declaration?.parameters as any)?.$schema).toBeUndefined();
	});

	it.each([
		{ label: "zero", value: 0 },
		{ label: "false", value: false },
		{ label: "empty string", value: "" },
	])("createTool async fn preserves falsy $label", async ({ value }) => {
		const tool = createTool({
			name: `falsy_${String(value)}`,
			description: "Preserves falsy async results",
			fn: async () => value,
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toBe(value);
	});

	it("createTool maps null and undefined fn results to empty object", async () => {
		const nullTool = createTool({
			name: "null_result",
			description: "Null becomes empty object",
			fn: () => null,
		});
		const undefTool = createTool({
			name: "undef_result",
			description: "Undefined becomes empty object",
			fn: () => undefined,
		});
		await expect(nullTool.runAsync({}, makeContext())).resolves.toEqual({});
		await expect(undefTool.runAsync({}, makeContext())).resolves.toEqual({});
	});

	it("createTool wraps non-Zod Error subclass messages", async () => {
		class BoomError extends Error {}
		const tool = createTool({
			name: "boom_subclass",
			description: "Throws Error subclass",
			fn: () => {
				throw new BoomError("subclass boom");
			},
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			error: "Error executing boom_subclass: subclass boom",
		});
	});

	it("createTool stringifies non-Error throws", async () => {
		const tool = createTool({
			name: "plain_throw",
			description: "Throws plain object",
			fn: () => {
				throw { code: 42 };
			},
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			error: "Error executing plain_throw: [object Object]",
		});
	});

	it.each([
		{ isLongRunning: undefined, expected: false },
		{ isLongRunning: false, expected: false },
		{ isLongRunning: true, expected: true },
	])("createTool isLongRunning=$isLongRunning → $expected via ??", ({
		isLongRunning,
		expected,
	}) => {
		const tool = createTool({
			name: `long_${String(isLongRunning)}`,
			description: "Long running flag matrix",
			isLongRunning,
			fn: () => ({}),
		});
		expect(tool.isLongRunning).toBe(expected);
	});

	it("createTool Zod validation returns envelope without invoking fn", async () => {
		const fn = vi.fn();
		const tool = createTool({
			name: "zod_gate",
			description: "Validates before fn",
			schema: z.object({ n: z.number() }),
			fn,
		});
		const result = await tool.runAsync({ n: "bad" }, makeContext());
		expect(fn).not.toHaveBeenCalled();
		expect(result.error).toContain("Invalid arguments for zod_gate");
	});

	it("default apiVariant remains google on BaseTool subclasses", () => {
		const tool = new StubTool({
			name: "api_variant",
			description: "Default api variant",
		});
		expect((tool as any).apiVariant).toBe("google");
	});
});
