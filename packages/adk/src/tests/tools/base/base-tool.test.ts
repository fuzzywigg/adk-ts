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

	it("processLlmRequest pushes a new tool entry when existing tools lack functionDeclarations", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		const request = new LlmRequest();
		request.config = {
			tools: [{ googleSearch: {} } as any],
		};

		await tool.processLlmRequest(makeContext(), request);

		expect(request.toolsDict.search_tool).toBe(tool);
		expect(request.config.tools).toHaveLength(2);
		expect(
			(request.config.tools?.[1] as any).functionDeclarations?.[0]?.name,
		).toBe("search_tool");
	});

	it("appends onto an existing functionDeclarations tool entry", async () => {
		const tool = new StubTool({
			name: "decl_tool",
			description: "Declaration tool",
		});
		const request = new LlmRequest();
		request.config = {
			tools: [{ functionDeclarations: [{ name: "other" }] } as any],
		};
		await tool.processLlmRequest(makeContext(), request);
		const fds = (request.config.tools?.[0] as any).functionDeclarations;
		expect(fds.map((fd: any) => fd.name)).toEqual(["other", "decl_tool"]);
	});

	it("safeExecute wraps non-Error throws into the exhaustion envelope", async () => {
		vi.useFakeTimers();
		const tool = new StubTool(
			{
				name: "string_fail",
				description: "Throws a string",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 0,
			},
			async () => {
				throw "plain boom";
			},
		);
		tool.baseRetryDelay = 1;
		tool.maxRetryDelay = 1;
		vi.spyOn(console, "error").mockImplementation(() => {});

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({
			error: "Execution failed",
			message: "plain boom",
			tool: "string_fail",
		});
		vi.useRealTimers();
	});

	it("exposes protected apiVariant as google by default", () => {
		class VariantProbe extends BaseTool {
			getDeclaration() {
				return null;
			}
			readVariant() {
				return this.apiVariant;
			}
		}
		const tool = new VariantProbe({
			name: "variant_probe",
			description: "Reads api variant",
		});
		expect(tool.readVariant()).toBe("google");
	});

	it("validateArguments returns true when required is an empty array", () => {
		class EmptyRequiredTool extends BaseTool {
			getDeclaration() {
				return {
					name: this.name,
					description: this.description,
					parameters: {
						type: Type.OBJECT,
						properties: {},
						required: [],
					},
				};
			}
			async runAsync() {
				return {};
			}
		}
		const tool = new EmptyRequiredTool({
			name: "empty_required",
			description: "No required fields",
		});
		expect(tool.validateArguments({})).toBe(true);
	});

	it("defaults retry flags when omitted from ToolConfig", () => {
		const tool = new StubTool({
			name: "defaults_tool",
			description: "Uses constructor defaults",
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
		expect(tool.baseRetryDelay).toBe(1000);
		expect(tool.maxRetryDelay).toBe(10000);
	});

	it("does not retry when shouldRetryOnFailure is false", async () => {
		let attempts = 0;
		const tool = new StubTool(
			{
				name: "no_retry",
				description: "Fails once",
				shouldRetryOnFailure: false,
			},
			async () => {
				attempts += 1;
				throw new Error("once");
			},
		);
		vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			tool.safeExecute({ query: "x" }, makeContext()),
		).resolves.toEqual({
			error: "Execution failed",
			message: "once",
			tool: "no_retry",
		});
		expect(attempts).toBe(1);
	});

	it("caps retry delay at maxRetryDelay during backoff", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		let attempts = 0;
		const tool = new StubTool(
			{
				name: "backoff_cap",
				description: "Tests delay cap",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 2,
			},
			async () => {
				attempts += 1;
				if (attempts < 3) {
					throw new Error("again");
				}
				return { ok: true };
			},
		);
		tool.baseRetryDelay = 5000;
		tool.maxRetryDelay = 10;
		vi.spyOn(console, "error").mockImplementation(() => {});

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({ result: { ok: true } });
		expect(attempts).toBe(3);
		vi.useRealTimers();
	});
});
