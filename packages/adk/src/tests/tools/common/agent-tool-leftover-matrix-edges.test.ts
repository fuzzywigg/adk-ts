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
		id: "session-matrix",
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

describe("AgentTool leftover matrix edges (TOKENMAXX deepen)", () => {
	describe("constructor Cartesian coalesce", () => {
		it.each([
			{
				label: "all omitted → false/false/3/false + agent.description",
				config: {},
				expectLong: false,
				expectRetry: false,
				expectAttempts: 3,
				expectSkip: false,
				expectDesc: "Agent desc",
			},
			{
				label: "falsy 0 maxRetryAttempts → 3",
				config: { maxRetryAttempts: 0 },
				expectLong: false,
				expectRetry: false,
				expectAttempts: 3,
				expectSkip: false,
				expectDesc: "Agent desc",
			},
			{
				label: "explicit flags + attempts + skip + description",
				config: {
					isLongRunning: true,
					shouldRetryOnFailure: true,
					maxRetryAttempts: 5,
					skipSummarization: true,
					description: "Config desc",
				},
				expectLong: true,
				expectRetry: true,
				expectAttempts: 5,
				expectSkip: true,
				expectDesc: "Config desc",
			},
			{
				label: "false flags stay false; empty description falls back to agent",
				config: {
					isLongRunning: false,
					shouldRetryOnFailure: false,
					skipSummarization: false,
					description: "",
				},
				expectLong: false,
				expectRetry: false,
				expectAttempts: 3,
				expectSkip: false,
				expectDesc: "Agent desc",
			},
			{
				label: "nullish description falls back to agent.description",
				config: { description: undefined },
				expectLong: false,
				expectRetry: false,
				expectAttempts: 3,
				expectSkip: false,
				expectDesc: "Agent desc",
			},
		])("$label", ({
			config,
			expectLong,
			expectRetry,
			expectAttempts,
			expectSkip,
			expectDesc,
		}) => {
			const agent = makeStubAgent({ description: "Agent desc" });
			const tool = new AgentTool({
				name: "ctor_matrix",
				agent,
				...config,
			});
			expect(tool.isLongRunning).toBe(expectLong);
			expect(tool.shouldRetryOnFailure).toBe(expectRetry);
			expect(tool.maxRetryAttempts).toBe(expectAttempts);
			expect((tool as any).skipSummarization).toBe(expectSkip);
			expect(tool.description).toBe(expectDesc);
		});

		it("Cartesian product of boolean flags × attempts coalesce", () => {
			const agent = makeStubAgent();
			for (const isLongRunning of [undefined, false, true] as const) {
				for (const shouldRetryOnFailure of [undefined, false, true] as const) {
					for (const maxRetryAttempts of [undefined, 0, 4] as const) {
						const tool = new AgentTool({
							name: "cart",
							agent,
							...(isLongRunning === undefined ? {} : { isLongRunning }),
							...(shouldRetryOnFailure === undefined
								? {}
								: { shouldRetryOnFailure }),
							...(maxRetryAttempts === undefined ? {} : { maxRetryAttempts }),
						});
						expect(tool.isLongRunning).toBe(Boolean(isLongRunning));
						expect(tool.shouldRetryOnFailure).toBe(
							Boolean(shouldRetryOnFailure),
						);
						expect(tool.maxRetryAttempts).toBe(
							maxRetryAttempts ? maxRetryAttempts : 3,
						);
					}
				}
			}
		});
	});

	describe("params.input || Object.values(params)[0] falsy matrix", () => {
		it.each([
			{
				label: "omitted input uses first custom value",
				params: { topic: "from-topic" },
				expected: "from-topic",
			},
			{
				label:
					"empty-string input is falsy so Object.values[0] wins when topic is first",
				params: { topic: "fallback-topic", input: "" },
				expected: "fallback-topic",
			},
			{
				label:
					"0 input is falsy; when input is first key, Object.values[0] is still 0",
				params: { input: 0, topic: "ignored" },
				expected: "0",
			},
			{
				label:
					"false input is falsy; topic-first object yields topic via Object.values[0]",
				params: { topic: "from-false", input: false },
				expected: "from-false",
			},
			{
				label:
					"null input is falsy; topic-first object yields topic via Object.values[0]",
				params: { topic: "from-null", input: null },
				expected: "from-null",
			},
			{
				label: "truthy input preferred over siblings",
				params: { topic: "ignored", input: "chosen" },
				expected: "chosen",
			},
			{
				label: "only falsy input remains as Object.values[0]",
				params: { input: "" },
				expected: "",
			},
			{
				label: "numeric zero as sole param stringifies via String(input)",
				params: { input: 0 },
				expected: "0",
			},
		])("$label", async ({ params, expected }) => {
			const seen: string[] = [];
			const agent = makeStubAgent({
				runAsync: async function* (ctx) {
					seen.push(String(ctx.userContent?.parts?.[0]?.text));
					yield new Event({
						author: "stub_agent",
						content: { role: "model", parts: [{ text: "ok" }] },
					});
				},
			});
			const tool = new AgentTool({ name: "input_matrix", agent });
			const { context } = makeToolContext(agent);
			await tool.runAsync(params as any, context);
			expect(seen[0]).toBe(expected);
		});

		it("empty params object yields String(undefined) for userContent", async () => {
			const seen: string[] = [];
			const agent = makeStubAgent({
				runAsync: async function* (ctx) {
					seen.push(String(ctx.userContent?.parts?.[0]?.text));
					yield new Event({
						author: "stub_agent",
						content: { role: "model", parts: [{ text: "ok" }] },
					});
				},
			});
			const tool = new AgentTool({ name: "empty_params", agent });
			const { context } = makeToolContext(agent);
			await tool.runAsync({}, context);
			expect(seen[0]).toBe("undefined");
		});
	});

	describe("lastEvent missing content/parts early return", () => {
		it.each([
			{
				label: "no events yielded",
				runAsync: async function* () {},
			},
			{
				label: "events with wrong author only",
				runAsync: async function* () {
					yield new Event({
						author: "other",
						content: { role: "model", parts: [{ text: "nope" }] },
					});
				},
			},
			{
				label: "matching author but missing content",
				runAsync: async function* () {
					yield new Event({ author: "stub_agent" });
				},
			},
			{
				label: "matching author with content but undefined parts",
				runAsync: async function* () {
					yield new Event({
						author: "stub_agent",
						content: { role: "model" } as any,
					});
				},
			},
		])('$label → ""', async ({ runAsync }) => {
			const agent = makeStubAgent({ runAsync });
			const tool = new AgentTool({ name: "early_return", agent });
			const { context } = makeToolContext(agent);
			await expect(tool.runAsync({ input: "x" }, context)).resolves.toBe("");
		});
	});

	describe("catch Error.message vs String(non-Error)", () => {
		it.each([
			{
				label: "Error uses message",
				throwValue: new Error("agent crashed"),
				expected: "Agent tool execution failed: agent crashed",
			},
			{
				label: "string uses String",
				throwValue: "raw-boom",
				expected: "Agent tool execution failed: raw-boom",
			},
			{
				label: "number uses String",
				throwValue: 500,
				expected: "Agent tool execution failed: 500",
			},
			{
				label: "object uses String",
				throwValue: { err: true },
				expected: "Agent tool execution failed: [object Object]",
			},
			{
				label: "boolean uses String",
				throwValue: false,
				expected: "Agent tool execution failed: false",
			},
		])("$label", async ({ throwValue, expected }) => {
			const agent = makeStubAgent({
				// biome-ignore lint/correctness/useYield: throws before yielding
				runAsync: async function* () {
					throw throwValue;
				},
			});
			const tool = new AgentTool({ name: "catch_matrix", agent });
			const { context } = makeToolContext(agent);
			await expect(tool.runAsync({ input: "go" }, context)).rejects.toThrow(
				expected,
			);
		});
	});
});
