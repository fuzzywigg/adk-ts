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

describe("AgentTool leftover: params.input || Object.values(params)[0] falsy fallthrough", () => {
	const falsyInputs = ["", 0, false] as const;

	for (const falsy of falsyInputs) {
		it(`uses alternate first value when input is ${JSON.stringify(falsy)} and query is first key`, async () => {
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
			const tool = new AgentTool({ name: "fallthrough", agent });
			const { context } = makeToolContext(agent);
			await tool.runAsync(
				{ query: "from-query", input: falsy as any },
				context,
			);
			expect(seen[0]).toBe("from-query");
		});
	}

	for (const falsy of falsyInputs) {
		it(`keeps falsy Object.values[0] when input=${JSON.stringify(falsy)} is the only / first key`, async () => {
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
			const tool = new AgentTool({ name: "falsy_only", agent });
			const { context } = makeToolContext(agent);
			await tool.runAsync({ input: falsy as any }, context);
			expect(seen[0]).toBe(String(falsy));
		});
	}

	it("empty string input with later topic key still yields empty when input is values[0]", async () => {
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
		const tool = new AgentTool({ name: "empty_first", agent });
		const { context } = makeToolContext(agent);
		await tool.runAsync({ input: "", topic: "should-not-win" }, context);
		expect(seen[0]).toBe("");
	});

	it("zero input with later prompt key still yields 0 when input is values[0]", async () => {
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
		const tool = new AgentTool({ name: "zero_first", agent });
		const { context } = makeToolContext(agent);
		await tool.runAsync({ input: 0 as any, prompt: "ignored" }, context);
		expect(seen[0]).toBe("0");
	});

	it("false input with later text key still yields false when input is values[0]", async () => {
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
		const tool = new AgentTool({ name: "false_first", agent });
		const { context } = makeToolContext(agent);
		await tool.runAsync({ input: false as any, text: "ignored" }, context);
		expect(seen[0]).toBe("false");
	});

	const alternateKeys = ["query", "prompt", "topic", "message", "text", "q"];

	for (const key of alternateKeys) {
		it(`falls through empty input to params.${key} when that key precedes input`, async () => {
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
			const tool = new AgentTool({ name: `alt_${key}`, agent });
			const { context } = makeToolContext(agent);
			const params: Record<string, any> = {};
			params[key] = `value-for-${key}`;
			params.input = "";
			await tool.runAsync(params, context);
			expect(seen[0]).toBe(`value-for-${key}`);
		});
	}

	for (const key of alternateKeys) {
		it(`falls through input=0 to params.${key} when that key precedes input`, async () => {
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
			const tool = new AgentTool({ name: `zero_alt_${key}`, agent });
			const { context } = makeToolContext(agent);
			const params: Record<string, any> = {};
			params[key] = `num-${key}`;
			params.input = 0;
			await tool.runAsync(params, context);
			expect(seen[0]).toBe(`num-${key}`);
		});
	}

	for (const key of alternateKeys) {
		it(`falls through input=false to params.${key} when that key precedes input`, async () => {
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
			const tool = new AgentTool({ name: `bool_alt_${key}`, agent });
			const { context } = makeToolContext(agent);
			const params: Record<string, any> = {};
			params[key] = `bool-${key}`;
			params.input = false;
			await tool.runAsync(params, context);
			expect(seen[0]).toBe(`bool-${key}`);
		});
	}
});

describe("AgentTool leftover: falsy input with custom schema still executes", () => {
	it("custom declaration with topic param works when input is omitted (uses values[0])", async () => {
		const seen: string[] = [];
		const agent = makeStubAgent({
			runAsync: async function* (ctx) {
				seen.push(String(ctx.userContent?.parts?.[0]?.text));
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text: '{"done":true}' }] },
				});
			},
		});
		const tool = new AgentTool({
			name: "custom_topic",
			agent,
			functionDeclaration: {
				name: "custom_topic",
				description: "topic tool",
				parameters: {
					type: Type.OBJECT,
					properties: {
						topic: { type: Type.STRING },
					},
					required: ["topic"],
				},
			},
		});
		const { context } = makeToolContext(agent);
		const result = await tool.runAsync({ topic: "typescript" }, context);
		expect(seen[0]).toBe("typescript");
		expect(result).toEqual({ done: true });
	});

	it("undefined input falls through to first param value", async () => {
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
		const tool = new AgentTool({ name: "undef_input", agent });
		const { context } = makeToolContext(agent);
		await tool.runAsync({ input: undefined, body: "body-text" }, context);
		expect(seen[0]).toBe("body-text");
	});

	it("null input falls through to first param value", async () => {
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
		const tool = new AgentTool({ name: "null_input", agent });
		const { context } = makeToolContext(agent);
		await tool.runAsync(
			{ payload: "from-payload", input: null as any },
			context,
		);
		expect(seen[0]).toBe("from-payload");
	});

	it("truthy input short-circuits and ignores other params", async () => {
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
		const tool = new AgentTool({ name: "truthy_input", agent });
		const { context } = makeToolContext(agent);
		await tool.runAsync({ query: "should-ignore", input: "primary" }, context);
		expect(seen[0]).toBe("primary");
	});

	it("stores outputKey when fallthrough input produces a result", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text: "stored" }] },
				});
			},
		});
		const tool = new AgentTool({
			name: "store_fallthrough",
			agent,
			outputKey: "agent_out",
		});
		const { context } = makeToolContext(agent);
		await tool.runAsync({ question: "q", input: "" }, context);
		expect(context.state.agent_out).toBe("stored");
	});

	const numericFallthrough = [
		{ input: 0, first: "alpha", expected: "alpha" },
		{ input: 0, first: 99, expected: "99" },
		{ input: false, first: true, expected: "true" },
		{ input: "", first: " ", expected: " " },
		{ input: "", first: "0", expected: "0" },
	] as const;

	for (const { input, first, expected } of numericFallthrough) {
		it(`fallthrough matrix input=${JSON.stringify(input)} first=${JSON.stringify(first)}`, async () => {
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
			const tool = new AgentTool({ name: "matrix", agent });
			const { context } = makeToolContext(agent);
			await tool.runAsync({ first, input: input as any }, context);
			expect(seen[0]).toBe(expected);
		});
	}
});
