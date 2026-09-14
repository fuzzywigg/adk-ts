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
		id: "session-tenth",
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
		runAsync: LlmAgent["runAsync"];
	}> = {},
): LlmAgent {
	const name = overrides.name ?? "stub_agent";
	return {
		name,
		description: "Stub",
		instruction: "Answer",
		runAsync:
			overrides.runAsync ??
			async function* () {
				yield new Event({
					author: name,
					content: { role: "model", parts: [{ text: "ok" }] },
				});
			},
	} as LlmAgent;
}

function makeToolContext(agent: LlmAgent) {
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
	return new ToolContext(invocationContext);
}

/**
 * Tenth leftover: part.text !== undefined && !== null keeps ""; JSON.parse of
 * falsy JSON primitives stores null/false/0/"" under outputKey (not strings).
 */
describe("agent-tool empty-text json-parse falsy tenth leftover edges", () => {
	it("keeps empty-string text parts in the join (unlike filter(Boolean))", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: {
						role: "model",
						parts: [{ text: "" }, { text: "tail" }],
					},
				});
			},
		});
		const tool = new AgentTool({ name: "empty_text", agent });
		const context = makeToolContext(agent);
		const result = await tool.runAsync({ input: "x" }, context);
		expect(result).toBe("\ntail");
	});

	it("drops undefined/null text parts but keeps whitespace-only strings", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: {
						role: "model",
						parts: [
							{ text: undefined as any },
							{ text: null as any },
							{ text: "  " },
						],
					},
				});
			},
		});
		const tool = new AgentTool({ name: "ws_text", agent });
		const context = makeToolContext(agent);
		expect(await tool.runAsync({ input: "x" }, context)).toBe("  ");
	});

	it.each([
		{ label: "null", text: "null", expected: null },
		{ label: "false", text: "false", expected: false },
		{ label: "0", text: "0", expected: 0 },
		{ label: '""', text: '""', expected: "" },
	])("JSON.parse falsy primitive $label stored under outputKey", async ({
		text,
		expected,
	}) => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text }] },
				});
			},
		});
		const tool = new AgentTool({
			name: "parse_falsy",
			agent,
			outputKey: "parsed",
		});
		const context = makeToolContext(agent);
		const result = await tool.runAsync({ input: "x" }, context);
		expect(result).toBe(expected);
		expect(context.state.parsed).toBe(expected);
	});

	it("empty merged text stays empty string (JSON.parse throws)", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text: "" }] },
				});
			},
		});
		const tool = new AgentTool({
			name: "empty_only",
			agent,
			outputKey: "out",
		});
		const context = makeToolContext(agent);
		expect(await tool.runAsync({ input: "x" }, context)).toBe("");
		expect(context.state.out).toBe("");
	});
});
