import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { BaseTool } from "../../../tools/base/base-tool";
import { BaseToolset } from "../../../tools/base/base-toolset";
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

class ListToolset extends BaseToolset {
	constructor(private readonly tools: BaseTool[]) {
		super();
	}

	async getTools(_context?: ToolContext): Promise<BaseTool[]> {
		return this.tools;
	}

	async close(): Promise<void> {}
}

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("BaseTool heavy matrix leftover edges", () => {
	it("rejects invalid names and short descriptions", () => {
		expect(
			() =>
				new StubTool({
					name: "bad-name!",
					description: "valid description here",
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

	it("accepts underscore and alphanumeric names", () => {
		const tool = new StubTool({
			name: "ok_tool_2",
			description: "Valid description length",
		});
		expect(tool.name).toBe("ok_tool_2");
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("honors long-running and retry config", () => {
		const tool = new StubTool({
			name: "retry_tool",
			description: "Retries on failure when enabled",
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 5,
		});
		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(5);
	});

	it("validateArguments requires declared required fields", () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches for things online",
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(tool.validateArguments({ query: "x" })).toBe(true);
		expect(tool.validateArguments({})).toBe(false);
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});

	it("processLlmRequest registers toolsDict and dedupes declarations", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches for things online",
		});
		const request = new LlmRequest();
		await tool.processLlmRequest(makeContext(), request);
		await tool.processLlmRequest(makeContext(), request);
		expect(request.toolsDict.search_tool).toBe(tool);
		expect(request.config?.tools).toHaveLength(1);
		expect(
			(request.config?.tools?.[0] as any).functionDeclarations,
		).toHaveLength(1);
	});

	it("safeExecute returns validation failure envelope", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches for things online",
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(tool.safeExecute({}, makeContext())).resolves.toEqual({
			error: "Invalid arguments",
			message: "The provided arguments do not match the tool's requirements.",
		});
	});

	it("safeExecute runs the tool when args are valid", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches for things online",
		});
		await expect(
			tool.safeExecute({ query: "adk" }, makeContext()),
		).resolves.toEqual({
			result: { ok: true, args: { query: "adk" } },
		});
	});

	it("safeExecute wraps thrown errors", async () => {
		const tool = new StubTool(
			{
				name: "boom_tool",
				description: "Always throws an error",
			},
			async () => {
				throw new Error("boom");
			},
		);
		const result = await tool.safeExecute({ query: "x" }, makeContext());
		expect(result.error).toBeDefined();
		expect(String(result.message || result.error)).toContain("boom");
	});
});

describe("BaseToolset heavy matrix leftover edges", () => {
	it("list tools returns the configured tool instances", async () => {
		const a = new StubTool({
			name: "tool_a",
			description: "First tool description",
		});
		const b = new StubTool({
			name: "tool_b",
			description: "Second tool description",
		});
		const set = new ListToolset([a, b]);
		await expect(set.getTools()).resolves.toEqual([a, b]);
	});

	it("empty toolset returns an empty array", async () => {
		const set = new ListToolset([]);
		await expect(set.getTools(makeContext())).resolves.toEqual([]);
	});
});
