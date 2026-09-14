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
		instruction: unknown;
		runAsync: LlmAgent["runAsync"];
	}> = {},
): LlmAgent {
	const name = overrides.name ?? "stub_agent";
	return {
		name,
		description: overrides.description ?? "Stub agent description",
		instruction: Object.hasOwn(overrides, "instruction")
			? overrides.instruction
			: "Answer the user request",
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
	overrides: Record<string, unknown> = {},
) {
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

describe("AgentTool matrix leftover edges", () => {
	it("falls back to tool description for null, number, and object instructions", () => {
		for (const instruction of [null, 12, { prompt: "x" }]) {
			const agent = makeStubAgent({ instruction });
			const tool = new AgentTool({
				name: "dyn_tool",
				description: "Tool description",
				agent,
			});
			expect(tool.getDeclaration().description).toBe("Tool description");
		}
	});

	it("prefers config description over agent description", () => {
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

	it("stores skipSummarization and still writes outputKey", async () => {
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

	it("ignores author-matching events without content when selecting lastEvent", async () => {
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

	it("returns empty string for empty parts arrays", async () => {
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

	it("parses JSON arrays, numbers, and objects from merged text", async () => {
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

	it("does not appendEvent when every yielded event is partial", async () => {
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

	it("nests child branch under parent branch when present", async () => {
		const seen: string[] = [];
		const agent = makeStubAgent({
			name: "child",
			runAsync: async function* (ctx) {
				seen.push(String(ctx.branch));
				yield new Event({
					author: "child",
					content: { role: "model", parts: [{ text: "ok" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "branch_tool", agent });
		const { context } = makeToolContext(agent, { branch: "root.agent" });
		await tool.runAsync({ input: "x" }, context);
		expect(seen[0]).toContain("root.agent");
		expect(seen[0]).toContain("child");
	});
});
