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

describe("BaseTool leftover edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("initializes functionDeclarations when the found tool later reports them missing", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		let reads = 0;
		let stored: any[] | undefined;
		const existing = {
			get functionDeclarations() {
				reads += 1;
				if (reads <= 2) {
					return [{ name: "already_there" }];
				}
				return stored;
			},
			set functionDeclarations(v: any[]) {
				stored = v;
			},
		};
		const request = new LlmRequest({ config: { tools: [existing as any] } });

		await tool.processLlmRequest(makeContext(), request);

		expect(stored?.some((d) => d.name === "search_tool")).toBe(true);
		expect(request.toolsDict.search_tool).toBe(tool);
	});

	it("uses Unknown error occurred when Error.message is empty", async () => {
		const tool = new StubTool(
			{ name: "empty_msg", description: "Empty message throw" },
			async () => {
				throw new Error("");
			},
		);
		vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			tool.safeExecute({ query: "x" }, makeContext()),
		).resolves.toEqual({
			error: "Execution failed",
			message: "Unknown error occurred",
			tool: "empty_msg",
		});
	});

	it("uses Unknown error occurred when Error.message is whitespace-only falsy after trim is not applied", async () => {
		const tool = new StubTool(
			{
				name: "blank_msg",
				description: "Blank message throw",
				shouldRetryOnFailure: false,
			},
			async () => {
				const err = new Error("x");
				Object.defineProperty(err, "message", { value: "" });
				throw err;
			},
		);
		vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await tool.safeExecute({ query: "x" }, makeContext());
		expect(result).toEqual({
			error: "Execution failed",
			message: "Unknown error occurred",
			tool: "blank_msg",
		});
	});

	it("dedupes against a declaration that appears after functionDeclarations is initialized empty then filled", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		let reads = 0;
		const decls: any[] = [{ name: "already_there" }];
		const existing = {
			get functionDeclarations() {
				reads += 1;
				if (reads <= 2) {
					return decls;
				}
				return decls;
			},
			set functionDeclarations(v: any[]) {
				decls.length = 0;
				decls.push(...v);
			},
		};
		const request = new LlmRequest({ config: { tools: [existing as any] } });

		await tool.processLlmRequest(makeContext(), request);
		await tool.processLlmRequest(makeContext(), request);

		expect(decls.filter((d) => d.name === "search_tool")).toHaveLength(1);
	});

	it("safeExecute with retries still surfaces empty message on final exhaustion", async () => {
		vi.useFakeTimers();
		const tool = new StubTool(
			{
				name: "retry_empty",
				description: "Retries then empty message",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 1,
			},
			async () => {
				throw new Error("");
			},
		);
		tool.baseRetryDelay = 1;
		tool.maxRetryDelay = 1;
		vi.spyOn(console, "error").mockImplementation(() => {});

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({
			error: "Execution failed",
			message: "Unknown error occurred",
			tool: "retry_empty",
		});
	});

	it("processLlmRequest keeps toolsDict when initializing missing functionDeclarations bag", async () => {
		const tool = new StubTool({
			name: "bag_init",
			description: "Initializes declarations bag",
		});
		let reads = 0;
		let stored: any[] | undefined;
		const existing = {
			get functionDeclarations() {
				reads += 1;
				if (reads <= 2) {
					return [{ name: "seed" }];
				}
				return stored;
			},
			set functionDeclarations(v: any[]) {
				stored = v;
			},
		};
		const request = new LlmRequest({
			config: { tools: [existing as any] },
		});
		request.toolsDict = { preexisting: tool };

		await tool.processLlmRequest(makeContext(), request);

		expect(request.toolsDict.bag_init).toBe(tool);
		expect(request.toolsDict.preexisting).toBe(tool);
		expect(stored?.[0]?.name).toBe("bag_init");
	});

	it("validateArguments still fails when required key is present but undefined", () => {
		const tool = new StubTool({
			name: "req_undef",
			description: "Requires query key",
		});
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(tool.validateArguments({ query: undefined })).toBe(true);
		expect(tool.validateArguments({})).toBe(false);
	});

	it("safeExecute returns result envelope for undefined runAsync returns", async () => {
		const tool = new StubTool(
			{ name: "undef_result", description: "Returns undefined" },
			async () => undefined,
		);

		await expect(
			tool.safeExecute({ query: "x" }, makeContext()),
		).resolves.toEqual({ result: undefined });
	});
});
