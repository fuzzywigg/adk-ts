import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { InvocationContext } from "../../../agents/invocation-context";
import { PluginManager } from "../../../plugins/plugin-manager";
import { Event } from "../../../events/event";
import type { BaseSessionService } from "../../../sessions/base-session-service";
import type { Session } from "../../../sessions/session";
import { AgentTool } from "../../../tools/common/agent-tool";
import { ToolContext } from "../../../tools/tool-context";
import type { LlmAgent } from "../../../agents/llm-agent";

function makeSession(): Session {
	return {
		id: "session-1",
		appName: "app",
		userId: "user-1",
		state: {},
		events: [],
		lastUpdateTime: 0,
	};
}

function makeStubAgent(
	overrides: Partial<{
		name: string;
		description: string;
		instruction: string;
		runAsync: LlmAgent["runAsync"];
	}> = {},
): LlmAgent {
	const name = overrides.name ?? "stub_agent";
	return {
		name,
		description: overrides.description ?? "Stub agent description",
		instruction: overrides.instruction ?? "Answer the user request",
		runAsync:
			overrides.runAsync ??
			async function* () {
				yield new Event({
					author: name,
					content: {
						role: "model",
						parts: [{ text: "hello from agent" }],
					},
				});
			},
	} as LlmAgent;
}

function makeToolContext(agent: LlmAgent): {
	context: ToolContext;
	appendEvent: ReturnType<typeof vi.fn>;
} {
	const appendEvent = vi.fn().mockResolvedValue(undefined);
	const sessionService = { appendEvent } as unknown as BaseSessionService;
	const invocationContext = new InvocationContext({
		sessionService,
		pluginManager: new PluginManager(),
		agent,
		session: makeSession(),
		runConfig: {} as any,
		branch: "root",
	});
	return {
		context: new ToolContext(invocationContext),
		appendEvent,
	};
}

describe("AgentTool", () => {
	it("exposes constructor metadata from config and agent", () => {
		const agent = makeStubAgent({
			description: "Agent description",
		});
		const tool = new AgentTool({
			name: "research_agent",
			agent,
		});

		expect(tool.name).toBe("research_agent");
		expect(tool.description).toBe("Agent description");
		expect(tool.isLongRunning).toBe(false);
	});

	it("returns a default declaration from agent instruction", () => {
		const agent = makeStubAgent({
			instruction: "Research the given topic thoroughly",
		});
		const tool = new AgentTool({
			name: "research_agent",
			agent,
		});
		const declaration = tool.getDeclaration();

		expect(declaration.name).toBe("research_agent");
		expect(declaration.description).toBe("Research the given topic thoroughly");
		expect(declaration.parameters?.required).toEqual(["input"]);
		expect(declaration.parameters?.properties?.input).toEqual({
			type: Type.STRING,
			description: "The input to provide to the agent",
		});
	});

	it("returns a custom functionDeclaration when provided", () => {
		const agent = makeStubAgent();
		const custom = {
			name: "custom_schema",
			description: "Custom schema",
			parameters: {
				type: Type.OBJECT,
				properties: {
					topic: { type: Type.STRING, description: "Topic" },
				},
				required: ["topic"],
			},
		};
		const tool = new AgentTool({
			name: "research_agent",
			agent,
			functionDeclaration: custom,
		});

		expect(tool.getDeclaration()).toEqual(custom);
	});

	it("runs the agent, collects text, and stores outputKey in state", async () => {
		const agent = makeStubAgent({
			name: "writer",
			runAsync: async function* () {
				yield new Event({
					author: "writer",
					content: {
						role: "model",
						parts: [{ text: "line one" }, { text: "line two" }],
					},
				});
			},
		});
		const tool = new AgentTool({
			name: "writer_tool",
			agent,
			outputKey: "agent_output",
		});
		const { context, appendEvent } = makeToolContext(agent);

		const result = await tool.runAsync({ input: "write something" }, context);

		expect(result).toBe("line one\nline two");
		expect(context.state.agent_output).toBe("line one\nline two");
		expect(appendEvent).toHaveBeenCalled();
	});

	it("sets isLongRunning and accepts skipSummarization config", () => {
		const agent = makeStubAgent();
		const tool = new AgentTool({
			name: "long_tool",
			agent,
			isLongRunning: true,
			skipSummarization: true,
		});

		expect(tool.isLongRunning).toBe(true);
		expect((tool as any).skipSummarization).toBe(true);
	});

	it("wraps errors thrown by agent.runAsync", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "other",
					content: { role: "model", parts: [] },
				});
				throw new Error("agent crashed");
			},
		});
		const tool = new AgentTool({
			name: "failing_tool",
			agent,
		});
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "go" }, context)).rejects.toThrow(
			"Agent tool execution failed: agent crashed",
		);
	});

	it("uses the first custom schema value when input is omitted", async () => {
		const runAsync = vi.fn(async function* () {
			yield new Event({
				author: "stub_agent",
				content: { role: "model", parts: [{ text: "from-topic" }] },
			});
		});
		const agent = makeStubAgent({ runAsync });
		const tool = new AgentTool({
			name: "research_agent",
			agent,
			functionDeclaration: {
				name: "research_agent",
				description: "Custom",
				parameters: {
					type: Type.OBJECT,
					properties: {
						topic: { type: Type.STRING, description: "Topic" },
					},
					required: ["topic"],
				},
			},
		});
		const { context } = makeToolContext(agent);

		const result = await tool.runAsync({ topic: "vitest" }, context);

		expect(result).toBe("from-topic");
		expect(runAsync).toHaveBeenCalled();
		const childCtx = runAsync.mock.calls[0][0] as {
			userContent?: { parts?: Array<{ text?: string }> };
		};
		expect(childCtx.userContent?.parts?.[0]?.text).toBe("vitest");
	});

	it("returns empty string when agent yields no author-matching content", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "other",
					content: { role: "model", parts: [{ text: "ignored" }] },
				});
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [] },
				});
			},
		});
		const tool = new AgentTool({ name: "empty_tool", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("");
	});

	it("parses JSON text results and stores objects under outputKey", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: {
						role: "model",
						parts: [{ text: '{"ok":true,"n":3}' }],
					},
				});
			},
		});
		const tool = new AgentTool({
			name: "json_tool",
			agent,
			outputKey: "parsed",
		});
		const { context } = makeToolContext(agent);

		const result = await tool.runAsync({ input: "go" }, context);

		expect(result).toEqual({ ok: true, n: 3 });
		expect(context.state.parsed).toEqual({ ok: true, n: 3 });
	});

	it("skips appendEvent for partial events and appends non-partial ones", async () => {
		const agent = makeStubAgent({
			name: "streamer",
			runAsync: async function* () {
				yield new Event({
					author: "streamer",
					partial: true,
					content: { role: "model", parts: [{ text: "chunk" }] },
				});
				yield new Event({
					author: "streamer",
					partial: false,
					content: { role: "model", parts: [{ text: "final" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "stream_tool", agent });
		const { context, appendEvent } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("final");
		expect(appendEvent).toHaveBeenCalledTimes(1);
		expect(appendEvent.mock.calls[0][1].partial).toBeFalsy();
	});

	it("builds child branch from agent name when parent branch is unset", async () => {
		const runAsync = vi.fn(async function* () {
			yield new Event({
				author: "leaf",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
		const agent = makeStubAgent({ name: "leaf", runAsync });
		const tool = new AgentTool({ name: "leaf_tool", agent });
		const appendEvent = vi.fn().mockResolvedValue(undefined);
		const sessionService = { appendEvent } as unknown as BaseSessionService;
		const invocationContext = new InvocationContext({
			sessionService,
			pluginManager: new PluginManager(),
			agent,
			session: makeSession(),
			runConfig: {} as any,
		});
		const context = new ToolContext(invocationContext);

		await tool.runAsync({ input: "x" }, context);

		expect(runAsync.mock.calls[0][0].branch).toBe("leaf");
	});

	it("falls back to tool description when agent instruction is not a string", () => {
		const agent = makeStubAgent({
			description: "Agent fallback description",
		});
		(agent as { instruction: unknown }).instruction = async () => "dynamic";
		const tool = new AgentTool({
			name: "provider_tool",
			description: "Tool description",
			agent,
		});

		expect(tool.getDeclaration().description).toBe("Tool description");
	});

	it("stringifies non-Error throws from agent.runAsync", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "other",
					content: { role: "model", parts: [] },
				});
				throw "boom";
			},
		});
		const tool = new AgentTool({ name: "string_fail", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "go" }, context)).rejects.toThrow(
			"Agent tool execution failed: boom",
		);
	});

	it("uses explicit description over agent.description", () => {
		const agent = makeStubAgent({ description: "Agent description" });
		const tool = new AgentTool({
			name: "override_tool",
			description: "Explicit tool description",
			agent,
		});

		expect(tool.description).toBe("Explicit tool description");
	});

	it("wires shouldRetryOnFailure and maxRetryAttempts from config", () => {
		const agent = makeStubAgent();
		const tool = new AgentTool({
			name: "retry_tool",
			agent,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 7,
		});

		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(7);
	});

	it("defaults shouldRetryOnFailure to false and maxRetryAttempts to 3", () => {
		const agent = makeStubAgent();
		const tool = new AgentTool({ name: "defaults", agent });

		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
		expect((tool as any).skipSummarization).toBe(false);
	});

	it("stringifies undefined custom-schema input when params are empty", async () => {
		const runAsync = vi.fn(async function* () {
			yield new Event({
				author: "stub_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
		const agent = makeStubAgent({ runAsync });
		const tool = new AgentTool({ name: "empty_params", agent });
		const { context } = makeToolContext(agent);

		await tool.runAsync({}, context);

		const childCtx = runAsync.mock.calls[0][0] as {
			userContent?: { parts?: Array<{ text?: string }> };
		};
		expect(childCtx.userContent?.parts?.[0]?.text).toBe("undefined");
	});

	it("prefers params.input over other custom schema values", async () => {
		const runAsync = vi.fn(async function* () {
			yield new Event({
				author: "stub_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
		const agent = makeStubAgent({ runAsync });
		const tool = new AgentTool({ name: "prefer_input", agent });
		const { context } = makeToolContext(agent);

		await tool.runAsync({ topic: "ignored", input: "chosen" }, context);

		const childCtx = runAsync.mock.calls[0][0] as {
			userContent?: { parts?: Array<{ text?: string }> };
		};
		expect(childCtx.userContent?.parts?.[0]?.text).toBe("chosen");
	});

	it("returns empty string when last matching event has only non-text parts", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: {
						role: "model",
						parts: [{ functionCall: { name: "x", args: {} } } as any],
					},
				});
			},
		});
		const tool = new AgentTool({ name: "non_text", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("");
	});

	it("filters nullish text parts and joins remaining text with newlines", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: {
						role: "model",
						parts: [
							{ text: "keep" },
							{ text: null as any },
							{ text: undefined as any },
							{ text: "also" },
						],
					},
				});
			},
		});
		const tool = new AgentTool({ name: "filter_text", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe(
			"keep\nalso",
		);
	});

	it("keeps invalid JSON merged text as a string", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: {
						role: "model",
						parts: [{ text: "{not-json" }, { text: " more" }],
					},
				});
			},
		});
		const tool = new AgentTool({ name: "bad_json", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe(
			"{not-json\n more",
		);
	});

	it("parses JSON array text results", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: {
						role: "model",
						parts: [{ text: '[1,{"a":2}]' }],
					},
				});
			},
		});
		const tool = new AgentTool({
			name: "array_json",
			agent,
			outputKey: "arr",
		});
		const { context } = makeToolContext(agent);

		const result = await tool.runAsync({ input: "go" }, context);
		expect(result).toEqual([1, { a: 2 }]);
		expect(context.state.arr).toEqual([1, { a: 2 }]);
	});

	it("skips outputKey storage when context.state is missing", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text: "stored?" }] },
				});
			},
		});
		const tool = new AgentTool({
			name: "no_state",
			agent,
			outputKey: "out",
		});
		const { context } = makeToolContext(agent);
		Object.defineProperty(context, "state", {
			get: () => undefined,
			configurable: true,
		});

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe(
			"stored?",
		);
	});

	it("does not store when outputKey is unset even if state exists", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text: "plain" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "no_key", agent });
		const { context } = makeToolContext(agent);
		const beforeKeys = Object.keys(context.state);

		await tool.runAsync({ input: "x" }, context);

		expect(Object.keys(context.state)).toEqual(beforeKeys);
	});

	it("wraps appendEvent rejections as Agent tool execution failed", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text: "x" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "append_fail", agent });
		const { context, appendEvent } = makeToolContext(agent);
		appendEvent.mockRejectedValue(new Error("append boom"));

		await expect(tool.runAsync({ input: "go" }, context)).rejects.toThrow(
			"Agent tool execution failed: append boom",
		);
	});

	it("uses the last author-matching event when multiple are yielded", async () => {
		const agent = makeStubAgent({
			name: "multi",
			runAsync: async function* () {
				yield new Event({
					author: "multi",
					content: { role: "model", parts: [{ text: "first" }] },
				});
				yield new Event({
					author: "other",
					content: { role: "model", parts: [{ text: "ignored" }] },
				});
				yield new Event({
					author: "multi",
					content: { role: "model", parts: [{ text: "last" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "multi_tool", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("last");
	});

	it("returns empty string when agent yields no events", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				// no yields
			},
		});
		const tool = new AgentTool({ name: "silent", agent });
		const { context, appendEvent } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("");
		expect(appendEvent).not.toHaveBeenCalled();
	});

	it("returns empty string when matching event has no content", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
				});
			},
		});
		const tool = new AgentTool({ name: "no_content", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("");
	});

	it("builds nested branch from parent branch and agent name", async () => {
		const runAsync = vi.fn(async function* () {
			yield new Event({
				author: "child",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
		const agent = makeStubAgent({ name: "child", runAsync });
		const tool = new AgentTool({ name: "child_tool", agent });
		const { context } = makeToolContext(agent);

		await tool.runAsync({ input: "x" }, context);

		expect(runAsync.mock.calls[0][0].branch).toBe("root.child");
	});

	it("propagates parent services into the child invocation context", async () => {
		const runAsync = vi.fn(async function* () {
			yield new Event({
				author: "stub_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
		const agent = makeStubAgent({ runAsync });
		const tool = new AgentTool({ name: "svc_tool", agent });
		const artifactService = { listArtifactKeys: vi.fn() };
		const memoryService = { searchMemory: vi.fn() };
		const appendEvent = vi.fn().mockResolvedValue(undefined);
		const sessionService = { appendEvent } as unknown as BaseSessionService;
		const pluginManager = new PluginManager();
		const session = makeSession();
		const runConfig = { streamingMode: "none" } as any;
		const invocationContext = new InvocationContext({
			sessionService,
			pluginManager,
			agent,
			session,
			artifactService: artifactService as any,
			memoryService: memoryService as any,
			runConfig,
			branch: "parent",
		});
		const context = new ToolContext(invocationContext);

		await tool.runAsync({ input: "payload" }, context);

		const child = runAsync.mock.calls[0][0] as InvocationContext;
		expect(child.session).toBe(session);
		expect(child.artifactService).toBe(artifactService);
		expect(child.sessionService).toBe(sessionService);
		expect(child.memoryService).toBe(memoryService);
		expect(child.pluginManager).toBe(pluginManager);
		expect(child.runConfig).toBe(runConfig);
		expect(child.agent).toBe(agent);
		expect(child.invocationId).not.toBe(invocationContext.invocationId);
		expect(child.userContent).toEqual({
			role: "user",
			parts: [{ text: "payload" }],
		});
	});

	it("stringifies numeric custom-schema values for userContent", async () => {
		const runAsync = vi.fn(async function* () {
			yield new Event({
				author: "stub_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
		const agent = makeStubAgent({ runAsync });
		const tool = new AgentTool({ name: "num_tool", agent });
		const { context } = makeToolContext(agent);

		await tool.runAsync({ n: 42 }, context);

		const childCtx = runAsync.mock.calls[0][0] as {
			userContent?: { parts?: Array<{ text?: string }> };
		};
		expect(childCtx.userContent?.parts?.[0]?.text).toBe("42");
	});

	it("exposes outputKey on the tool instance when configured", () => {
		const agent = makeStubAgent();
		const tool = new AgentTool({
			name: "keyed",
			agent,
			outputKey: "result_key",
		});
		expect(tool.outputKey).toBe("result_key");
	});

	it("leaves skipSummarization stored without changing runAsync result", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text: "same" }] },
				});
			},
		});
		const withSkip = new AgentTool({
			name: "skip_on",
			agent,
			skipSummarization: true,
		});
		const withoutSkip = new AgentTool({
			name: "skip_off",
			agent,
			skipSummarization: false,
		});
		const { context: ctx1 } = makeToolContext(agent);
		const { context: ctx2 } = makeToolContext(agent);

		await expect(withSkip.runAsync({ input: "x" }, ctx1)).resolves.toBe("same");
		await expect(withoutSkip.runAsync({ input: "x" }, ctx2)).resolves.toBe(
			"same",
		);
		expect((withSkip as any).skipSummarization).toBe(true);
		expect((withoutSkip as any).skipSummarization).toBe(false);
	});
});
