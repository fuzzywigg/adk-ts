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

	it("accepts description of exactly three characters", () => {
		expect(
			() =>
				new StubTool({
					name: "min_desc",
					description: "abc",
				}),
		).not.toThrow();
	});

	it("rejects empty and whitespace-only descriptions as too short", () => {
		expect(
			() =>
				new StubTool({
					name: "empty_desc",
					description: "",
				}),
		).toThrow(/too short/);
		expect(
			() =>
				new StubTool({
					name: "short_ws",
					description: "  ",
				}),
		).toThrow(/too short/);
	});

	it("rejects names with spaces, hyphens, dots, and unicode", () => {
		for (const name of [
			"has space",
			"has-dash",
			"has.dot",
			"café",
			"emoji_😀",
		]) {
			expect(
				() =>
					new StubTool({
						name,
						description: "Valid description",
					}),
			).toThrow(/Invalid tool name/);
		}
	});

	it("applies constructor defaults for long-running and retry flags", () => {
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

	it("honors explicit long-running and retry constructor options", () => {
		const tool = new StubTool({
			name: "configured_tool",
			description: "Explicit config",
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 9,
		});
		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(9);
	});

	it("treats falsy isLongRunning and shouldRetryOnFailure as false", () => {
		const tool = new StubTool({
			name: "falsy_flags",
			description: "Falsy flags",
			isLongRunning: false,
			shouldRetryOnFailure: false,
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("falls back maxRetryAttempts to 3 when config passes 0 (falsy)", () => {
		const tool = new StubTool({
			name: "zero_max",
			description: "Zero becomes default",
			maxRetryAttempts: 0,
		});
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("validateArguments returns true when required is an empty array", () => {
		class EmptyRequiredTool extends BaseTool {
			getDeclaration() {
				return {
					name: this.name,
					description: this.description,
					parameters: {
						type: Type.OBJECT,
						properties: {
							optional: { type: Type.STRING },
						},
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
			description: "No required params",
		});
		expect(tool.validateArguments({})).toBe(true);
		expect(tool.validateArguments({ optional: "x" })).toBe(true);
	});

	it("validateArguments returns true when parameters omit required", () => {
		class NoRequiredKeyTool extends BaseTool {
			getDeclaration() {
				return {
					name: this.name,
					description: this.description,
					parameters: {
						type: Type.OBJECT,
						properties: {
							maybe: { type: Type.STRING },
						},
					},
				};
			}
			async runAsync() {
				return {};
			}
		}

		const tool = new NoRequiredKeyTool({
			name: "no_required_key",
			description: "Optional-only schema",
		});
		expect(tool.validateArguments({})).toBe(true);
	});

	it("validateArguments reports the first missing required parameter", () => {
		class MultiRequiredTool extends BaseTool {
			getDeclaration() {
				return {
					name: this.name,
					description: this.description,
					parameters: {
						type: Type.OBJECT,
						properties: {
							a: { type: Type.STRING },
							b: { type: Type.STRING },
						},
						required: ["a", "b"],
					},
				};
			}
			async runAsync() {
				return {};
			}
		}

		const tool = new MultiRequiredTool({
			name: "multi_req",
			description: "Needs a and b",
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(tool.validateArguments({ a: "only" })).toBe(false);
		expect(error).toHaveBeenCalledWith(
			'Missing required parameter "b" for tool "multi_req"',
		);
		error.mockRestore();
	});

	it("validateArguments accepts args that include all required keys", () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		expect(tool.validateArguments({ query: "", extra: true })).toBe(true);
	});

	it("default getDeclaration returns null on BaseTool subclasses that omit override", () => {
		class BareTool extends BaseTool {}
		const tool = new BareTool({
			name: "bare_tool",
			description: "Uses default declaration",
		});
		expect(tool.getDeclaration()).toBeNull();
	});

	it("processLlmRequest creates config and tools when both are missing", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		const request = new LlmRequest();
		expect(request.config).toBeUndefined();

		await tool.processLlmRequest(makeContext(), request);

		expect(request.config).toBeDefined();
		expect(request.config?.tools).toHaveLength(1);
		expect(
			(request.config?.tools?.[0] as any).functionDeclarations[0].name,
		).toBe("search_tool");
		expect(request.toolsDict.search_tool).toBe(tool);
	});

	it("processLlmRequest creates tools array when config exists without tools", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		const request = new LlmRequest({
			config: { temperature: 0.2 },
		});

		await tool.processLlmRequest(makeContext(), request);

		expect(request.config?.temperature).toBe(0.2);
		expect(request.config?.tools).toHaveLength(1);
	});

	it("processLlmRequest appends to an existing functionDeclarations list when names differ", async () => {
		const first = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		const second = new StubTool({
			name: "lookup_tool",
			description: "Looks up things",
		});
		const request = new LlmRequest();

		await first.processLlmRequest(makeContext(), request);
		await second.processLlmRequest(makeContext(), request);

		expect(request.config?.tools).toHaveLength(1);
		const declarations = (request.config?.tools?.[0] as any)
			.functionDeclarations;
		expect(declarations).toHaveLength(2);
		expect(declarations.map((d: any) => d.name)).toEqual([
			"search_tool",
			"lookup_tool",
		]);
		expect(request.toolsDict.search_tool).toBe(first);
		expect(request.toolsDict.lookup_tool).toBe(second);
	});

	it("processLlmRequest treats empty functionDeclarations as no match and pushes a new tool", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
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
		).toBe("search_tool");
	});

	it("processLlmRequest ignores tools that lack functionDeclarations keys", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		const request = new LlmRequest({
			config: {
				tools: [
					{ codeExecution: {} } as any,
					{ googleSearchRetrieval: {} } as any,
				],
			},
		});

		await tool.processLlmRequest(makeContext(), request);

		expect(request.config?.tools).toHaveLength(3);
		expect(
			(request.config?.tools?.[2] as any).functionDeclarations,
		).toHaveLength(1);
	});

	it("processLlmRequest still registers toolsDict when appending to existing declarations", async () => {
		const existing = new StubTool({
			name: "alpha_tool",
			description: "Alpha tool",
		});
		const next = new StubTool({
			name: "beta_tool",
			description: "Beta tool",
		});
		const request = new LlmRequest();
		await existing.processLlmRequest(makeContext(), request);
		await next.processLlmRequest(makeContext(), request);

		expect(Object.keys(request.toolsDict).sort()).toEqual([
			"alpha_tool",
			"beta_tool",
		]);
	});

	it("processLlmRequest dedupes only when declaration names match exactly", async () => {
		class RenamedStub extends BaseTool {
			constructor(
				config: ConstructorParameters<typeof BaseTool>[0],
				private readonly declName: string,
			) {
				super(config);
			}
			getDeclaration() {
				return {
					name: this.declName,
					description: this.description,
					parameters: {
						type: Type.OBJECT,
						properties: {},
					},
				};
			}
			async runAsync() {
				return {};
			}
		}

		const first = new RenamedStub(
			{ name: "tool_a", description: "Tool A" },
			"shared_name",
		);
		const second = new RenamedStub(
			{ name: "tool_b", description: "Tool B" },
			"shared_name",
		);
		const request = new LlmRequest();
		await first.processLlmRequest(makeContext(), request);
		await second.processLlmRequest(makeContext(), request);

		expect(
			(request.config?.tools?.[0] as any).functionDeclarations,
		).toHaveLength(1);
		expect(request.toolsDict.tool_a).toBe(first);
		expect(request.toolsDict.tool_b).toBe(second);
	});

	it("safeExecute does not retry when shouldRetryOnFailure is false", async () => {
		let attempts = 0;
		const tool = new StubTool(
			{
				name: "no_retry",
				description: "Fails once",
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

	it("safeExecute with shouldRetryOnFailure true and maxRetryAttempts 1 fails after two tries", async () => {
		vi.useFakeTimers();
		let attempts = 0;
		const tool = new StubTool(
			{
				name: "one_retry",
				description: "One retry then fail",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 1,
			},
			async () => {
				attempts += 1;
				throw new Error("nope");
			},
		);
		tool.baseRetryDelay = 1;
		tool.maxRetryDelay = 1;
		vi.spyOn(console, "error").mockImplementation(() => {});

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toMatchObject({
			error: "Execution failed",
			tool: "one_retry",
		});
		expect(attempts).toBe(2);
		vi.useRealTimers();
	});

	it("safeExecute caps exponential backoff delay at maxRetryDelay", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		let attempts = 0;
		const delays: number[] = [];
		const realSetTimeout = globalThis.setTimeout;
		const tool = new StubTool(
			{
				name: "cap_delay",
				description: "Caps retry delay",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 3,
			},
			async () => {
				attempts += 1;
				if (attempts < 3) {
					throw new Error(`fail-${attempts}`);
				}
				return { ok: true };
			},
		);
		tool.baseRetryDelay = 5000;
		tool.maxRetryDelay = 6000;
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(globalThis, "setTimeout").mockImplementation(((
			handler: TimerHandler,
			timeout?: number,
			...args: any[]
		) => {
			delays.push(timeout ?? 0);
			return realSetTimeout(handler as any, 0, ...args);
		}) as any);

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({ result: { ok: true } });
		expect(attempts).toBe(3);
		expect(delays.length).toBeGreaterThanOrEqual(2);
		expect(Math.max(...delays)).toBeLessThanOrEqual(6000);
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("safeExecute logs retry attempts via the tool logger", async () => {
		vi.useFakeTimers();
		let attempts = 0;
		const tool = new StubTool(
			{
				name: "log_retry",
				description: "Logs retries",
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
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await pending;

		expect(debug).toHaveBeenCalledWith(
			expect.stringMatching(/Retrying tool log_retry \(attempt 1 of 2\)/),
		);
		vi.useRealTimers();
	});

	it("safeExecute succeeds after exhausting intermediate failures within max attempts", async () => {
		vi.useFakeTimers();
		let attempts = 0;
		const tool = new StubTool(
			{
				name: "third_time",
				description: "Succeeds on third try",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 3,
			},
			async () => {
				attempts += 1;
				if (attempts < 3) {
					throw new Error(`attempt-${attempts}`);
				}
				return { attempt: attempts };
			},
		);
		tool.baseRetryDelay = 1;
		tool.maxRetryDelay = 1;
		vi.spyOn(console, "error").mockImplementation(() => {});

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({ result: { attempt: 3 } });
		expect(attempts).toBe(3);
		vi.useRealTimers();
	});

	it("safeExecute returns validation failure before attempting runAsync", async () => {
		const run = vi.fn(async () => ({ ok: true }));
		const tool = new StubTool(
			{
				name: "search_tool",
				description: "Searches things",
			},
			run,
		);
		vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await tool.safeExecute({}, makeContext());
		expect(result.error).toBe("Invalid arguments");
		expect(run).not.toHaveBeenCalled();
	});

	it("allows subclasses to override apiVariant", () => {
		class OpenAiVariantTool extends BaseTool {
			getDeclaration() {
				return null;
			}
			protected get apiVariant() {
				return "openai" as const;
			}
			peek() {
				return this.apiVariant;
			}
		}
		class AnthropicVariantTool extends BaseTool {
			getDeclaration() {
				return null;
			}
			protected get apiVariant() {
				return "anthropic" as const;
			}
			peek() {
				return this.apiVariant;
			}
		}

		expect(
			new OpenAiVariantTool({
				name: "openai_variant",
				description: "OpenAI variant",
			}).peek(),
		).toBe("openai");
		expect(
			new AnthropicVariantTool({
				name: "anthropic_variant",
				description: "Anthropic variant",
			}).peek(),
		).toBe("anthropic");
	});

	it("keeps toolsDict entries stable across repeated processLlmRequest calls", async () => {
		const tool = new StubTool({
			name: "search_tool",
			description: "Searches things",
		});
		const request = new LlmRequest();
		await tool.processLlmRequest(makeContext(), request);
		const firstRef = request.toolsDict.search_tool;
		await tool.processLlmRequest(makeContext(), request);
		expect(request.toolsDict.search_tool).toBe(firstRef);
		expect(request.toolsDict.search_tool).toBe(tool);
	});

	it("processLlmRequest preserves preexisting non-function tools when adding declarations", async () => {
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
		expect(request.config?.tools?.[0]).toEqual({ googleSearch: {} });
		expect(
			(request.config?.tools?.[1] as any).functionDeclarations[0].name,
		).toBe("search_tool");
	});

	it("safeExecute wraps successful object results without mutating them", async () => {
		const payload = { nested: { value: 1 }, list: [1, 2] };
		const tool = new StubTool(
			{
				name: "payload_tool",
				description: "Returns nested payload",
			},
			async () => payload,
		);

		const result = await tool.safeExecute({ query: "x" }, makeContext());
		expect(result).toEqual({ result: payload });
		expect(result.result).toBe(payload);
	});

	it("constructor rejects names that are only punctuation", () => {
		expect(
			() =>
				new StubTool({
					name: "___",
					description: "Underscores only is alphanumeric-adjacent",
				}),
		).not.toThrow();
		expect(
			() =>
				new StubTool({
					name: "!!!",
					description: "Punctuation only",
				}),
		).toThrow(/Invalid tool name/);
	});

	it("validateArguments skips validation entirely when getDeclaration returns null", () => {
		class NullDeclTool extends BaseTool {
			getDeclaration() {
				return null;
			}
			async runAsync() {
				return {};
			}
		}
		const tool = new NullDeclTool({
			name: "null_decl",
			description: "Null declaration",
		});
		expect(tool.validateArguments({ anything: true })).toBe(true);
	});
});
