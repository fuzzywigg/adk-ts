import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { InvocationContext } from "../../../agents/invocation-context";
import type { LlmAgent } from "../../../agents/llm-agent";
import { Event } from "../../../events/event";
import { PluginManager } from "../../../plugins/plugin-manager";
import type { BaseSessionService } from "../../../sessions/base-session-service";
import type { Session } from "../../../sessions/session";
import { AgentTool } from "../../../tools/common/agent-tool";
import { ToolContext } from "../../../tools/tool-context";

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "session-1",
		appName: "app",
		userId: "user-1",
		state: {},
		events: [],
		lastUpdateTime: 0,
		...overrides,
	};
}

function makeStubAgent(
	overrides: Partial<{
		name: string;
		description: string;
		instruction: string | (() => string);
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

function makeToolContext(
	agent: LlmAgent,
	overrides: Partial<ConstructorParameters<typeof InvocationContext>[0]> = {},
): {
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
		...overrides,
	});
	return {
		context: new ToolContext(invocationContext),
		appendEvent,
	};
}

describe("AgentTool leftover edges", () => {
	it("falls back to tool description for null, number, and object instructions", () => {
		for (const instruction of [null, 12, { prompt: "x" }]) {
			const agent = makeStubAgent();
			(agent as { instruction: unknown }).instruction = instruction;
			const tool = new AgentTool({
				name: "dyn_tool",
				description: "Tool description",
				agent,
			});
			expect(tool.getDeclaration().description).toBe("Tool description");
		}
	});

	it("prefers config description over agent description when both are set", () => {
		const agent = makeStubAgent({ description: "Agent description" });
		(agent as { instruction: unknown }).instruction = () => "dynamic";
		const tool = new AgentTool({
			name: "pref_desc",
			description: "Config description",
			agent,
		});
		expect(tool.description).toBe("Config description");
		expect(tool.getDeclaration().description).toBe("Config description");
	});

	it("skips summarization flag is stored and does not change run output", async () => {
		const agent = makeStubAgent();
		const tool = new AgentTool({
			name: "skip_sum",
			agent,
			skipSummarization: true,
			outputKey: "out",
		});
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "go" }, context)).resolves.toBe(
			"hello from agent",
		);
		expect(context.state.out).toBe("hello from agent");
	});

	it("appends every non-partial event even when author does not match", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "other",
					content: { role: "model", parts: [{ text: "side" }] },
				});
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text: "main" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "append_all", agent });
		const { context, appendEvent } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("main");
		expect(appendEvent).toHaveBeenCalledTimes(2);
	});

	it("ignores author-matching events that lack content when selecting lastEvent", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({ author: "stub_agent" });
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text: "kept" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "content_gate", agent });
		const { context } = makeToolContext(agent);
		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("kept");
	});

	it("returns empty string when last matching event has empty parts array", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [] },
				});
			},
		});
		const tool = new AgentTool({ name: "empty_parts", agent });
		const { context } = makeToolContext(agent);
		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("");
	});

	it("joins only defined text parts and drops nullish text", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: {
						role: "model",
						parts: [
							{ text: "a" },
							{ text: null as any },
							{ inlineData: { data: "x", mimeType: "text/plain" } },
							{ text: "b" },
							{ text: undefined as any },
						],
					},
				});
			},
		});
		const tool = new AgentTool({ name: "join_text", agent });
		const { context } = makeToolContext(agent);
		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("a\nb");
	});

	it("parses JSON arrays and numbers from merged text", async () => {
		for (const [text, expected] of [
			["[1,2]", [1, 2]],
			["42", 42],
			['{"ok":true}', { ok: true }],
		] as const) {
			const agent = makeStubAgent({
				runAsync: async function* () {
					yield new Event({
						author: "stub_agent",
						content: { role: "model", parts: [{ text }] },
					});
				},
			});
			const tool = new AgentTool({
				name: "json_parse",
				agent,
				outputKey: "parsed",
			});
			const { context } = makeToolContext(agent);
			await expect(tool.runAsync({ input: "x" }, context)).resolves.toEqual(
				expected,
			);
			expect(context.state.parsed).toEqual(expected);
		}
	});

	it("shares parent session and services with the child invocation", async () => {
		const runAsync = vi.fn(async function* (ctx: InvocationContext) {
			expect(ctx.session.id).toBe("session-1");
			expect(ctx.artifactService).toBeDefined();
			expect(ctx.memoryService).toBeDefined();
			yield new Event({
				author: "stub_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
		const agent = makeStubAgent({ runAsync: runAsync as any });
		const artifactService = { listArtifactKeys: vi.fn() } as any;
		const memoryService = { searchMemory: vi.fn() } as any;
		const tool = new AgentTool({ name: "share_ctx", agent });
		const { context } = makeToolContext(agent, {
			artifactService,
			memoryService,
		});

		await tool.runAsync({ input: "x" }, context);
		expect(runAsync).toHaveBeenCalled();
	});

	it("custom functionDeclaration bypasses instruction-derived description", () => {
		const agent = makeStubAgent({ instruction: "ignored instruction" });
		const tool = new AgentTool({
			name: "custom_decl",
			agent,
			functionDeclaration: {
				name: "custom_decl",
				description: "Custom description",
				parameters: {
					type: Type.OBJECT,
					properties: {
						topic: { type: Type.STRING },
					},
					required: ["topic"],
				},
			},
		});
		const declaration = tool.getDeclaration();
		expect(declaration.description).toBe("Custom description");
		expect(declaration.parameters?.required).toEqual(["topic"]);
	});

	it("stringifies boolean and object inputs into userContent text", async () => {
		const seen: string[] = [];
		const agent = makeStubAgent({
			runAsync: async function* (ctx) {
				seen.push(String(ctx.userContent?.parts?.[0]?.text));
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text: "done" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "stringify_input", agent });
		const { context } = makeToolContext(agent);

		await tool.runAsync({ input: false as any }, context);
		await tool.runAsync({ input: { a: 1 } as any }, context);
		expect(seen).toEqual(["false", "[object Object]"]);
	});

	it("does not call appendEvent when every yielded event is partial", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					partial: true,
					content: { role: "model", parts: [{ text: "stream" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "all_partial", agent });
		const { context, appendEvent } = makeToolContext(agent);
		await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe(
			"stream",
		);
		expect(appendEvent).not.toHaveBeenCalled();
	});
});
