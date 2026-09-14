import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
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

describe("BaseTool", () => {
	it("validates name and description on construction", () => {
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

	it("validates required arguments", () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		expect(tool.validateArguments({ query: "x" })).toBe(true);
		expect(tool.validateArguments({})).toBe(false);
		expect(error).toHaveBeenCalled();
	});

	it("adds function declarations to llm requests and dedupes by name", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
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

	it("returns validation failures from safeExecute", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await tool.safeExecute({}, makeContext());
		expect(result).toEqual({
			error: "Invalid arguments",
			message: "The provided arguments do not match the tool's requirements.",
		});
	});

	it("retries failed executions when configured", async () => {
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
				if (attempts < 2) {
					throw new Error("transient");
				}
				return { ok: true };
			},
		);
		tool.baseRetryDelay = 1;
		tool.maxRetryDelay = 1;
		vi.spyOn(console, "error").mockImplementation(() => {});

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		const result = await pending;

		expect(result).toEqual({ result: { ok: true } });
		expect(attempts).toBe(2);
		vi.useRealTimers();
	});

	it("returns exhaustion envelope after retries fail", async () => {
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

	it("wraps successful runs without declaration validation", async () => {
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

	it("processLlmRequest no-ops when getDeclaration returns null", async () => {
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

	it("default runAsync throws not implemented", async () => {
		class Abstractish extends BaseTool {
			getDeclaration() {
				return null;
			}
		}

		const tool = new Abstractish({
			name: "abstract_tool",
			description: "Missing runAsync",
		});
		await expect(tool.runAsync({}, makeContext())).rejects.toThrow(
			/Abstractish runAsync is not implemented/,
		);
	});

	it("validateArguments returns true when declaration has no parameters", () => {
		class ParamlessTool extends BaseTool {
			getDeclaration() {
				return {
					name: this.name,
					description: this.description,
				};
			}
			async runAsync() {
				return {};
			}
		}

		const tool = new ParamlessTool({
			name: "paramless",
			description: "No parameters schema",
		});
		expect(tool.validateArguments({})).toBe(true);
	});

	it("exposes default apiVariant google for subclasses", () => {
		class VariantTool extends BaseTool {
			getDeclaration() {
				return null;
			}
			peekVariant() {
				return this.apiVariant;
			}
		}

		const tool = new VariantTool({
			name: "variant_tool",
			description: "Exposes api variant",
		});
		expect(tool.peekVariant()).toBe("google");
	});

	it("processLlmRequest appends a new functionDeclarations entry when tools lack declarations", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		const request = new LlmRequest({
			config: {
				tools: [{ googleSearch: {} } as any],
			},
		});

		await tool.processLlmRequest(makeContext(), request);

		expect(request.toolsDict.search_tool).toBe(tool);
		expect(request.config?.tools).toHaveLength(2);
		expect(
			(request.config?.tools?.[1] as any).functionDeclarations[0].name,
		).toBe("search_tool");
	});

	it("processLlmRequest appends onto an existing functionDeclarations list", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		const request = new LlmRequest({
			config: {
				tools: [
					{
						functionDeclarations: [
							{
								name: "other_tool",
								description: "Already present",
							},
						],
					},
				],
			},
		});

		await tool.processLlmRequest(makeContext(), request);

		expect(request.toolsDict.search_tool).toBe(tool);
		expect(request.config?.tools).toHaveLength(1);
		expect(
			(request.config?.tools?.[0] as any).functionDeclarations.map(
				(fd: { name: string }) => fd.name,
			),
		).toEqual(["other_tool", "search_tool"]);
	});

	it("processLlmRequest treats empty functionDeclarations as absent and creates a new tool entry", async () => {
		const tool = new StubTool({
			name: "fresh_tool",
			description: "Creates a fresh declarations entry",
		});
		const request = new LlmRequest({
			config: {
				tools: [{ functionDeclarations: [] } as any],
			},
		});

		await tool.processLlmRequest(makeContext(), request);

		expect(request.config?.tools).toHaveLength(2);
		expect(
			(request.config?.tools?.[1] as any).functionDeclarations[0].name,
		).toBe("fresh_tool");
	});

	it("safeExecute wraps non-Error throws into the exhaustion envelope", async () => {
		const tool = new StubTool(
			{
				name: "string_fail",
				description: "Throws a string",
			},
			async () => {
				throw "plain boom";
			},
		);
		vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			tool.safeExecute({ query: "x" }, makeContext()),
		).resolves.toEqual({
			error: "Execution failed",
			message: "plain boom",
			tool: "string_fail",
		});
	});

	it("safeExecute succeeds on first attempt without retry delay when retries disabled", async () => {
		const tool = new StubTool(
			{
				name: "once_tool",
				description: "Runs once",
			},
			async (args) => ({ echoed: args.query }),
		);

		await expect(
			tool.safeExecute({ query: "hello" }, makeContext()),
		).resolves.toEqual({
			result: { echoed: "hello" },
		});
	});

	it("accepts alphanumeric and underscore tool names including leading digits", () => {
		expect(
			() =>
				new StubTool({
					name: "tool_1",
					description: "Valid name",
				}),
		).not.toThrow();
		expect(
			() =>
				new StubTool({
					name: "9lives",
					description: "Leading digit allowed",
				}),
		).not.toThrow();
	});
});
