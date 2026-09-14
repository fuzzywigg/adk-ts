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

	it("falls back to tool description when instruction is a plain function", () => {
		const agent = makeStubAgent({
			description: "Agent description",
		});
		(agent as { instruction: unknown }).instruction = () => "fn-instruction";
		const tool = new AgentTool({
			name: "fn_instruction_tool",
			description: "Tool-level description",
			agent,
		});

		expect(tool.getDeclaration().description).toBe("Tool-level description");
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

	it("defaults shouldRetryOnFailure to false and maxRetryAttempts to 3", () => {
		const agent = makeStubAgent();
		const tool = new AgentTool({ name: "defaults_tool", agent });

		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("honors explicit retry config overrides", () => {
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

	it("stores outputKey on the public property", () => {
		const agent = makeStubAgent();
		const tool = new AgentTool({
			name: "keyed",
			agent,
			outputKey: "out",
		});
		expect(tool.outputKey).toBe("out");
	});

	it("filters non-text parts and joins remaining text with newlines", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: {
						role: "model",
						parts: [
							{ text: "keep-a" },
							{ inlineData: { mimeType: "image/png", data: "xx" } } as any,
							{ text: "keep-b" },
							{ text: null as any },
							{ text: undefined as any },
						],
					},
				});
			},
		});
		const tool = new AgentTool({ name: "parts_tool", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe(
			"keep-a\nkeep-b",
		);
	});

	it("returns empty string when last matching event has no parts property", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: { role: "model" } as any,
				});
			},
		});
		const tool = new AgentTool({ name: "no_parts", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("");
	});

	it("returns empty string when agent yields no events", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield* [] as AsyncIterable<Event>;
			},
		});
		const tool = new AgentTool({ name: "silent", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("");
	});

	it("stringifies non-string input values into userContent text", async () => {
		const runAsync = vi.fn(async function* () {
			yield new Event({
				author: "stub_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
		const agent = makeStubAgent({ runAsync });
		const tool = new AgentTool({ name: "num_input", agent });
		const { context } = makeToolContext(agent);

		await tool.runAsync({ input: 42 }, context);

		expect(runAsync.mock.calls[0][0].userContent?.parts?.[0]?.text).toBe("42");
	});

	it("stringifies undefined custom-schema first value as 'undefined'", async () => {
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

		expect(runAsync.mock.calls[0][0].userContent?.parts?.[0]?.text).toBe(
			"undefined",
		);
	});

	it("does not write outputKey when context.state is missing", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text: "value" }] },
				});
			},
		});
		const tool = new AgentTool({
			name: "no_state",
			agent,
			outputKey: "should_not_set",
		});
		const { context } = makeToolContext(agent);
		Object.defineProperty(context, "state", {
			get: () => undefined,
			configurable: true,
		});

		const result = await tool.runAsync({ input: "x" }, context);
		expect(result).toBe("value");
	});

	it("nests child branch under parent branch when present", async () => {
		const runAsync = vi.fn(async function* () {
			yield new Event({
				author: "child",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
		const agent = makeStubAgent({ name: "child", runAsync });
		const tool = new AgentTool({ name: "nested", agent });
		const { context } = makeToolContext(agent);

		await tool.runAsync({ input: "x" }, context);

		expect(runAsync.mock.calls[0][0].branch).toBe("root.child");
	});

	it("uses a distinct child invocationId from the parent", async () => {
		const runAsync = vi.fn(async function* () {
			yield new Event({
				author: "stub_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
		const agent = makeStubAgent({ runAsync });
		const tool = new AgentTool({ name: "id_tool", agent });
		const { context } = makeToolContext(agent);
		const parentId = context.invocationContext.invocationId;

		await tool.runAsync({ input: "x" }, context);

		const childId = runAsync.mock.calls[0][0].invocationId;
		expect(childId).toBeTruthy();
		expect(childId).not.toBe(parentId);
	});

	it("keeps the last author-matching event across multiple yields", async () => {
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

	it("leaves invalid JSON text as a plain string result", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: {
						role: "model",
						parts: [{ text: "{not-json" }],
					},
				});
			},
		});
		const tool = new AgentTool({ name: "bad_json", agent, outputKey: "raw" });
		const { context } = makeToolContext(agent);

		const result = await tool.runAsync({ input: "x" }, context);
		expect(result).toBe("{not-json");
		expect(context.state.raw).toBe("{not-json");
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

		expect(runAsync.mock.calls[0][0].userContent?.parts?.[0]?.text).toBe(
			"chosen",
		);
	});
});
