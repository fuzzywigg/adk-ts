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
		id: "session-fifth",
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

describe("AgentTool fifth leftover — author === agent.name case sensitivity", () => {
	const nearMissAuthors = [
		"Stub_Agent",
		"STUB_AGENT",
		"stub_Agent",
		"Stub Agent",
	];

	for (const author of nearMissAuthors) {
		it(`drops content when event.author is ${JSON.stringify(author)} ≠ agent.name`, async () => {
			const agent = makeStubAgent({
				name: "stub_agent",
				runAsync: async function* () {
					yield new Event({
						author,
						content: {
							role: "model",
							parts: [{ text: "should-be-dropped" }],
						},
					});
				},
			});
			const tool = new AgentTool({ name: "author_case", agent });
			const { context } = makeToolContext(agent);
			const result = await tool.runAsync({ input: "hi" }, context);
			expect(result).toBe("");
		});
	}

	it("keeps content when event.author exactly matches agent.name", async () => {
		const agent = makeStubAgent({
			name: "exact_agent",
			runAsync: async function* () {
				yield new Event({
					author: "exact_agent",
					content: {
						role: "model",
						parts: [{ text: "kept" }],
					},
				});
			},
		});
		const tool = new AgentTool({ name: "author_exact", agent });
		const { context } = makeToolContext(agent);
		const result = await tool.runAsync({ input: "hi" }, context);
		expect(result).toBe("kept");
	});

	it("uses last matching author event when mixed case near-misses precede exact", async () => {
		const agent = makeStubAgent({
			name: "mixed_agent",
			runAsync: async function* () {
				yield new Event({
					author: "Mixed_Agent",
					content: { role: "model", parts: [{ text: "wrong" }] },
				});
				yield new Event({
					author: "mixed_agent",
					content: { role: "model", parts: [{ text: "right" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "author_mixed", agent });
		const { context } = makeToolContext(agent);
		const result = await tool.runAsync({ input: "hi" }, context);
		expect(result).toBe("right");
	});
});

describe("AgentTool fifth leftover — description/branch || falsy defaults", () => {
	it("empty-string tool description falls through to agent.description via ||", () => {
		const agent = makeStubAgent({ description: "from-agent" });
		const tool = new AgentTool({
			name: "empty_desc",
			description: "",
			agent,
		});
		expect(tool.description).toBe("from-agent");
	});

	it("short truthy description 'ab' is kept by || but rejected by BaseTool length < 3", () => {
		const agent = makeStubAgent({ description: "from-agent" });
		expect(
			() =>
				new AgentTool({
					name: "short_desc",
					description: "ab",
					agent,
				}),
		).toThrow(/too short/);
	});

	it("truthy non-empty description is kept over agent.description via ||", () => {
		const agent = makeStubAgent({ description: "from-agent" });
		const tool = new AgentTool({
			name: "keep_desc",
			description: "tool-own-description",
			agent,
		});
		expect(tool.description).toBe("tool-own-description");
	});

	it("empty-string parent branch resets to agent.name (falsy ? arm)", async () => {
		const seen: string[] = [];
		const agent = makeStubAgent({
			name: "leaf_agent",
			runAsync: async function* (ctx) {
				seen.push(String(ctx.branch));
				yield new Event({
					author: "leaf_agent",
					content: { role: "model", parts: [{ text: "ok" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "branch_empty", agent });
		const { context } = makeToolContext(agent, { branch: "" });
		await tool.runAsync({ input: "x" }, context);
		expect(seen[0]).toBe("leaf_agent");
	});

	it("undefined parent branch resets to agent.name", async () => {
		const seen: Array<string | undefined> = [];
		const agent = makeStubAgent({
			name: "undef_leaf",
			runAsync: async function* (ctx) {
				seen.push(ctx.branch);
				yield new Event({
					author: "undef_leaf",
					content: { role: "model", parts: [{ text: "ok" }] },
				});
			},
		});
		const tool = new AgentTool({ name: "branch_undef", agent });
		const { context } = makeToolContext(agent, { branch: undefined });
		await tool.runAsync({ input: "x" }, context);
		expect(seen[0]).toBe("undef_leaf");
	});

	it("isLongRunning: 0 / shouldRetryOnFailure: 0 coalesce to false via ||", () => {
		const agent = makeStubAgent();
		const tool = new AgentTool({
			name: "falsy_flags",
			agent,
			isLongRunning: 0 as any,
			shouldRetryOnFailure: 0 as any,
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});

	it("skipSummarization: 0 coalesces to false via ||", () => {
		const agent = makeStubAgent();
		const tool = new AgentTool({
			name: "skip_zero",
			agent,
			skipSummarization: 0 as any,
		});
		expect((tool as any).skipSummarization).toBe(false);
	});
});
