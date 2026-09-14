import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";

class StubTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly impl?: (args: Record<string, any>) => Promise<any>,
		private readonly declaration?: any,
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
					limit: { type: Type.NUMBER },
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

describe("BaseTool deepen edges (TOKENMAXX remainder)", () => {
	it("validateArguments accepts required key present with undefined/null via in-operator", () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things carefully",
		});
		expect(tool.validateArguments({ query: undefined })).toBe(true);
		expect(tool.validateArguments({ query: null })).toBe(true);
		expect(tool.validateArguments({ query: "" })).toBe(true);
	});

	it("validateArguments returns true when declaration or parameters missing", () => {
		const noDecl = new StubTool(
			{ name: "bare_tool", description: "No declaration tool" },
			undefined,
			null,
		);
		const noParams = new StubTool(
			{ name: "noparam_tool", description: "No parameters tool" },
			undefined,
			{ name: "noparam_tool", description: "x" },
		);
		expect(noDecl.validateArguments({})).toBe(true);
		expect(noParams.validateArguments({})).toBe(true);
	});

	it("processLlmRequest still writes toolsDict before dedupe early-return", async () => {
		const first = new StubTool({
			name: "search_tool",
			description: "First description that is long",
		});
		const second = new StubTool({
			name: "search_tool",
			description: "Second description that differs",
		});
		const request = new LlmRequest();
		await first.processLlmRequest(makeContext(), request);
		await second.processLlmRequest(makeContext(), request);
		expect(request.toolsDict.search_tool).toBe(second);
		expect(
			(request.config?.tools?.[0] as any).functionDeclarations,
		).toHaveLength(1);
		expect(
			(request.config?.tools?.[0] as any).functionDeclarations[0].description,
		).toBe("First description that is long");
	});

	it("processLlmRequest skips adding when declaration is null but leaves toolsDict untouched", async () => {
		const tool = new StubTool(
			{ name: "builtin_search", description: "Builtin like search" },
			undefined,
			null,
		);
		const request = new LlmRequest();
		request.toolsDict = { prior: {} as any };
		await tool.processLlmRequest(makeContext(), request);
		expect(request.toolsDict.prior).toBeDefined();
		expect(request.toolsDict.builtin_search).toBeUndefined();
		expect(request.config?.tools).toBeUndefined();
	});

	it("finds existing tool when empty functionDeclarations array is not selected", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things carefully",
		});
		const request = new LlmRequest();
		request.config = {
			tools: [{ functionDeclarations: [] }, { googleSearch: {} } as any],
		};
		await tool.processLlmRequest(makeContext(), request);
		expect(request.config.tools).toHaveLength(3);
		expect((request.config.tools[2] as any).functionDeclarations[0].name).toBe(
			"search_tool",
		);
	});

	it("appends into existing non-empty functionDeclarations tool", async () => {
		const tool = new StubTool({
			name: "other_tool",
			description: "Another tool description",
		});
		const request = new LlmRequest();
		request.config = {
			tools: [
				{
					functionDeclarations: [
						{ name: "prior_tool", description: "prior", parameters: {} },
					],
				},
			],
		};
		await tool.processLlmRequest(makeContext(), request);
		expect(
			(request.config.tools?.[0] as any).functionDeclarations.map(
				(d: any) => d.name,
			),
		).toEqual(["prior_tool", "other_tool"]);
	});

	it("safeExecute with shouldRetryOnFailure false only attempts once", async () => {
		let attempts = 0;
		const tool = new StubTool(
			{
				name: "once_tool",
				description: "Fails without retries",
				shouldRetryOnFailure: false,
			},
			async () => {
				attempts += 1;
				throw new Error("boom");
			},
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const result = await tool.safeExecute({ query: "x" }, makeContext());
		expect(attempts).toBe(1);
		expect(result).toEqual({
			error: "Execution failed",
			message: "boom",
			tool: "once_tool",
		});
	});

	it("constructor maxRetryAttempts 0 becomes 3 via ||", () => {
		const tool = new StubTool({
			name: "retry_zero",
			description: "Zero becomes three",
			maxRetryAttempts: 0,
		});
		expect(tool.maxRetryAttempts).toBe(3);
	});
});
