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

	it("uses explicit description over agent description", () => {
		const tool = new AgentTool({
			name: "named",
			description: "Tool-level description",
			agent: makeStubAgent({ description: "Agent description" }),
		});
		expect(tool.description).toBe("Tool-level description");
	});

	it("forwards shouldRetryOnFailure and maxRetryAttempts", () => {
		const tool = new AgentTool({
			name: "retryable",
			agent: makeStubAgent(),
			shouldRetryOnFailure: true,
			maxRetryAttempts: 7,
		});
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(7);
	});

	it("falls back to tool description when instruction is not a string", () => {
		const agent = makeStubAgent({
			description: "fallback desc",
		});
		(agent as any).instruction = async () => "dynamic";
		const tool = new AgentTool({
			name: "dyn",
			description: "static tool desc",
			agent,
		});
		expect(tool.getDeclaration().description).toBe("static tool desc");
	});

	it("uses first custom-schema param value when input is absent", async () => {
		let seenUserContent: unknown;
		const agent = makeStubAgent({
			name: "researcher",
			runAsync: async function* (ctx) {
				seenUserContent = ctx.userContent;
				yield new Event({
					author: "researcher",
					content: { role: "model", parts: [{ text: "ok" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "research", agent });
		const { context } = makeToolContext(agent);

		await expect(
			tool.runAsync({ topic: "quantum computing" }, context),
		).resolves.toBe("ok");
		expect(seenUserContent).toEqual({
			role: "user",
			parts: [{ text: "quantum computing" }],
		});
	});

	it("prefers params.input over other custom schema keys", async () => {
		let seenText: string | undefined;
		const agent = makeStubAgent({
			name: "chooser",
			runAsync: async function* (ctx) {
				seenText = ctx.userContent?.parts?.[0]?.text;
				yield new Event({
					author: "chooser",
					content: { role: "model", parts: [{ text: "picked" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "choose", agent });
		const { context } = makeToolContext(agent);

		await tool.runAsync({ input: "primary", topic: "ignored" }, context);
		expect(seenText).toBe("primary");
	});

	it("returns empty string when agent yields no matching author event", async () => {
		const agent = makeStubAgent({
			name: "silent",
			runAsync: async function* () {
				yield new Event({
					author: "someone_else",
					content: { role: "model", parts: [{ text: "noise" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "silent_tool", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("");
	});

	it("returns empty string when matching event has no content parts", async () => {
		const agent = makeStubAgent({
			name: "empty",
			runAsync: async function* () {
				yield new Event({
					author: "empty",
					content: { role: "model", parts: undefined as any },
				});
			},
		});
		const tool = new AgentTool({ name: "empty_tool", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("");
	});

	it("keeps the last matching author event when multiple are yielded", async () => {
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
					content: { role: "model", parts: [{ text: "second" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "multi_tool", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe(
			"second",
		);
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
		expect(appendEvent.mock.calls[0][1].partial).toBe(false);
	});

	it("parses merged text as JSON when valid object or array", async () => {
		const agent = makeStubAgent({
			name: "json_agent",
			runAsync: async function* () {
				yield new Event({
					author: "json_agent",
					content: {
						role: "model",
						parts: [{ text: '{"score":42,"ok":true}' }],
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

		const result = await tool.runAsync({ input: "x" }, context);
		expect(result).toEqual({ score: 42, ok: true });
		expect(context.state.parsed).toEqual({ score: 42, ok: true });

		const arrayAgent = makeStubAgent({
			name: "arr_agent",
			runAsync: async function* () {
				yield new Event({
					author: "arr_agent",
					content: { role: "model", parts: [{ text: "[1,2,3]" }] },
				});
			},
		});
		const arrayTool = new AgentTool({ name: "arr_tool", agent: arrayAgent });
		const { context: arrayCtx } = makeToolContext(arrayAgent);
		await expect(arrayTool.runAsync({ input: "x" }, arrayCtx)).resolves.toEqual(
			[1, 2, 3],
		);
	});

	it("keeps JSON string primitives as strings after parse", async () => {
		const agent = makeStubAgent({
			name: "str_json",
			runAsync: async function* () {
				yield new Event({
					author: "str_json",
					content: { role: "model", parts: [{ text: '"hello"' }] },
				});
			},
		});
		const tool = new AgentTool({ name: "str_tool", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("hello");
	});

	it("filters non-text parts when joining merged text", async () => {
		const agent = makeStubAgent({
			name: "mixed",
			runAsync: async function* () {
				yield new Event({
					author: "mixed",
					content: {
						role: "model",
						parts: [
							{ text: "alpha" },
							{ inlineData: { mimeType: "image/png", data: "xx" } } as any,
							{ functionCall: { name: "noop", args: {} } } as any,
							{ text: "beta" },
							{ text: null as any },
						],
					},
				});
			},
		});
		const tool = new AgentTool({ name: "mixed_tool", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe(
			"alpha\nbeta",
		);
	});

	it("builds child branch from agent name when parent has no branch", async () => {
		const agent = makeStubAgent({
			name: "child_agent",
			runAsync: async function* (ctx) {
				yield new Event({
					author: "child_agent",
					content: {
						role: "model",
						parts: [{ text: `branch=${ctx.branch}` }],
					},
				});
			},
		});
		const tool = new AgentTool({ name: "branch_tool", agent });
		const appendEvent = vi.fn().mockResolvedValue(undefined);
		const invocationContext = new InvocationContext({
			sessionService: { appendEvent } as unknown as BaseSessionService,
			pluginManager: new PluginManager(),
			agent,
			session: makeSession(),
			runConfig: {} as any,
		});
		const context = new ToolContext(invocationContext);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe(
			"branch=child_agent",
		);
	});

	it("nests child branch under parent branch when present", async () => {
		const agent = makeStubAgent({
			name: "worker",
			runAsync: async function* (ctx) {
				yield new Event({
					author: "worker",
					content: {
						role: "model",
						parts: [{ text: String(ctx.branch) }],
					},
				});
			},
		});
		const tool = new AgentTool({ name: "nested", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe(
			"root.worker",
		);
	});

	it("uses a distinct child invocationId while sharing session services", async () => {
		let childInvocationId: string | undefined;
		let childSessionId: string | undefined;
		const agent = makeStubAgent({
			name: "id_agent",
			runAsync: async function* (ctx) {
				childInvocationId = ctx.invocationId;
				childSessionId = ctx.session.id;
				yield new Event({
					author: "id_agent",
					content: { role: "model", parts: [{ text: "done" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "id_tool", agent });
		const { context } = makeToolContext(agent);
		const parentId = context.invocationContext.invocationId;

		await tool.runAsync({ input: "x" }, context);

		expect(childInvocationId).toBeTruthy();
		expect(childInvocationId).not.toBe(parentId);
		expect(childSessionId).toBe("session-1");
	});

	it("does not write state when outputKey is omitted", async () => {
		const agent = makeStubAgent({
			name: "nostate",
			runAsync: async function* () {
				yield new Event({
					author: "nostate",
					content: { role: "model", parts: [{ text: "plain" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "nostate_tool", agent });
		const { context } = makeToolContext(agent);

		await tool.runAsync({ input: "x" }, context);
		expect(context.state.has("agent_output")).toBe(false);
		expect(context.state.get("agent_output")).toBeUndefined();
	});

	it("stringifies non-Error throws from the agent", async () => {
		const agent = makeStubAgent({
			// biome-ignore lint/correctness/useYield: error path under test
			runAsync: async function* () {
				throw "boom-string";
			},
		});
		const tool = new AgentTool({ name: "string_fail", agent });
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "go" }, context)).rejects.toThrow(
			"Agent tool execution failed: boom-string",
		);
	});

	it("stringifies numeric and object agent inputs into userContent text", async () => {
		const seen: string[] = [];
		const agent = makeStubAgent({
			name: "coerce",
			runAsync: async function* (ctx) {
				seen.push(String(ctx.userContent?.parts?.[0]?.text));
				yield new Event({
					author: "coerce",
					content: { role: "model", parts: [{ text: "ack" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "coerce_tool", agent });
		const { context } = makeToolContext(agent);

		await tool.runAsync({ input: 123 }, context);
		await tool.runAsync({ input: { a: 1 } }, context);
		expect(seen).toEqual(["123", "[object Object]"]);
	});
});
