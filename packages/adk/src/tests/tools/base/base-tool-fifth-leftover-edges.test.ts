import { Type } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { BaseTool } from "../../../tools/base/base-tool";
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
				properties: { query: { type: Type.STRING } },
				required: ["query", "mode"],
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

describe("BaseTool fifth leftover edges (TOKENMAXX)", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("reports each missing required parameter via console.error", () => {
		const tool = new StubTool({
			name: "multi_req",
			description: "Needs query and mode",
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(tool.validateArguments({ query: "x" })).toBe(false);
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining('Missing required parameter "mode"'),
		);
	});

	it("safeExecute returns non-Error throw messages via String()", async () => {
		const tool = new StubTool(
			{
				name: "throw_string",
				description: "Throws a string value",
			},
			async () => {
				throw "plain-string-fail";
			},
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const result = await tool.safeExecute(
			{ query: "q", mode: "fast" },
			makeContext(),
		);
		expect(result).toEqual({
			error: "Execution failed",
			message: "plain-string-fail",
			tool: "throw_string",
		});
	});

	it("safeExecute succeeds on last retry attempt boundary", async () => {
		vi.useFakeTimers();
		let attempts = 0;
		const tool = new StubTool(
			{
				name: "flaky_boundary",
				description: "Fails until last allowed attempt",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 1,
			},
			async () => {
				attempts += 1;
				if (attempts <= 1) {
					throw new Error("transient");
				}
				return { ok: true, attempts };
			},
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const pending = tool.safeExecute(
			{ query: "q", mode: "fast" },
			makeContext(),
		);
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({
			result: { ok: true, attempts: 2 },
		});
	});

	it("default apiVariant is google", () => {
		const tool = new StubTool({
			name: "variant_tool",
			description: "Checks api variant default",
		});
		expect((tool as any).apiVariant).toBe("google");
	});

	it("processLlmRequest initializes config and tools when absent", async () => {
		const tool = new StubTool({
			name: "init_tool",
			description: "Initializes request config tools",
		});
		const request = new LlmRequest();
		delete (request as any).config;
		await tool.processLlmRequest(makeContext(), request);
		expect(request.config?.tools).toHaveLength(1);
		expect(request.toolsDict.init_tool).toBe(tool);
	});
});
