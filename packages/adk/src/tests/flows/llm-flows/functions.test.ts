import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { EventActions } from "../../../events/event-actions";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";
import {
	AF_FUNCTION_CALL_ID_PREFIX,
	REQUEST_EUC_FUNCTION_CALL_NAME,
	generateAuthEvent,
	generateClientFunctionCallId,
	getLongRunningFunctionCalls,
	handleFunctionCallsAsync,
	mergeParallelFunctionResponseEvents,
	populateClientFunctionCallId,
	removeClientFunctionCallId,
} from "../../../flows/llm-flows/functions";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

vi.mock("../../../telemetry", () => ({
	telemetryService: {
		getTracer: () => ({
			startSpan: () => ({
				setStatus: vi.fn(),
				recordException: vi.fn(),
				end: vi.fn(),
			}),
		}),
		traceToolCall: vi.fn(),
	},
}));

class FakeTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly impl?: (args: Record<string, any>) => Promise<any>,
	) {
		super(config);
	}

	async runAsync(args: Record<string, any>, _context: ToolContext) {
		if (this.impl) {
			return this.impl(args);
		}
		return { ok: true, args };
	}
}

function makeInvocationContext(
	agent: Record<string, unknown>,
): InvocationContext {
	return {
		invocationId: "inv-1",
		branch: "main",
		agent,
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events: [],
			lastUpdateTime: 0,
		},
	} as unknown as InvocationContext;
}

function functionCallEvent(
	calls: Array<{ name: string; id?: string; args?: Record<string, unknown> }>,
): Event {
	return new Event({
		author: "agent",
		invocationId: "inv-1",
		content: {
			role: "model",
			parts: calls.map((c) => ({
				functionCall: {
					name: c.name,
					id: c.id,
					args: c.args ?? {},
				},
			})),
		},
	});
}

describe("function call helpers", () => {
	it("exports AF_FUNCTION_CALL_ID_PREFIX and REQUEST_EUC_FUNCTION_CALL_NAME", () => {
		expect(AF_FUNCTION_CALL_ID_PREFIX).toBe("adk-");
		expect(REQUEST_EUC_FUNCTION_CALL_NAME).toBe("adk_request_credential");
	});

	it("generateClientFunctionCallId starts with adk-", () => {
		expect(generateClientFunctionCallId().startsWith("adk-")).toBe(true);
	});

	it("populateClientFunctionCallId assigns ids when missing and preserves existing", () => {
		const event = functionCallEvent([
			{ name: "search", id: "keep-me" },
			{ name: "lookup" },
		]);

		populateClientFunctionCallId(event);

		const calls = event.getFunctionCalls();
		expect(calls[0].id).toBe("keep-me");
		expect(calls[1].id?.startsWith("adk-")).toBe(true);
	});

	it("removeClientFunctionCallId strips adk- prefixed ids", () => {
		const content = {
			role: "user" as const,
			parts: [
				{ functionCall: { name: "a", id: "adk-abc" } },
				{ functionCall: { name: "b", id: "keep" } },
				{
					functionResponse: {
						name: "a",
						id: "adk-xyz",
						response: { ok: true },
					},
				},
				{
					functionResponse: {
						name: "b",
						id: "server-id",
						response: { ok: true },
					},
				},
			],
		};

		removeClientFunctionCallId(content);

		expect(content.parts[0].functionCall?.id).toBeUndefined();
		expect(content.parts[1].functionCall?.id).toBe("keep");
		expect(content.parts[2].functionResponse?.id).toBeUndefined();
		expect(content.parts[3].functionResponse?.id).toBe("server-id");
	});

	it("getLongRunningFunctionCalls returns ids for long-running tools only", () => {
		const toolsDict = {
			slow: new FakeTool({
				name: "slow",
				description: "Long running tool",
				isLongRunning: true,
			}),
			fast: new FakeTool({
				name: "fast",
				description: "Quick tool",
			}),
		};

		const ids = getLongRunningFunctionCalls(
			[
				{ name: "slow", id: "lr-1" },
				{ name: "fast", id: "f-1" },
				{ name: "slow" },
				{ name: "missing", id: "m-1" },
			],
			toolsDict,
		);

		expect([...ids]).toEqual(["lr-1"]);
	});

	it("generateAuthEvent returns null without requestedAuthConfigs", () => {
		const event = new Event({
			author: "agent",
			actions: new EventActions(),
			content: { role: "user", parts: [] },
		});

		expect(
			generateAuthEvent(makeInvocationContext({ name: "agent" }), event),
		).toBeNull();
	});

	it("generateAuthEvent builds REQUEST_EUC when auth configs present", () => {
		const event = new Event({
			author: "agent",
			content: { role: "user", parts: [] },
			actions: new EventActions({
				requestedAuthConfigs: {
					"fc-1": { authScheme: { type: "oauth2" } },
				},
			}),
		});

		const authEvent = generateAuthEvent(
			makeInvocationContext({ name: "my-agent" }),
			event,
		);

		expect(authEvent).not.toBeNull();
		expect(authEvent?.author).toBe("my-agent");
		const call = authEvent?.getFunctionCalls()[0];
		expect(call?.name).toBe(REQUEST_EUC_FUNCTION_CALL_NAME);
		expect(call?.id?.startsWith("adk-")).toBe(true);
		expect(call?.args).toMatchObject({
			function_call_id: "fc-1",
		});
		expect(authEvent?.longRunningToolIds?.has(call!.id!)).toBe(true);
	});

	it("mergeParallelFunctionResponseEvents throws on empty", () => {
		expect(() => mergeParallelFunctionResponseEvents([])).toThrow(
			/No function response events provided/,
		);
	});

	it("mergeParallelFunctionResponseEvents returns single event unchanged", () => {
		const single = new Event({
			author: "agent",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "t",
							id: "1",
							response: { a: 1 },
						},
					},
				],
			},
		});
		expect(mergeParallelFunctionResponseEvents([single])).toBe(single);
	});

	it("mergeParallelFunctionResponseEvents merges parts and auth configs", () => {
		const first = new Event({
			author: "agent",
			branch: "main",
			timestamp: 100,
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "a",
							id: "1",
							response: { a: 1 },
						},
					},
				],
			},
			actions: new EventActions({
				requestedAuthConfigs: { "1": { scheme: "a" } },
			}),
		});
		const second = new Event({
			author: "agent",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "b",
							id: "2",
							response: { b: 2 },
						},
					},
				],
			},
			actions: new EventActions({
				requestedAuthConfigs: { "2": { scheme: "b" } },
			}),
		});

		const merged = mergeParallelFunctionResponseEvents([first, second]);

		expect(merged.content?.parts).toHaveLength(2);
		expect(merged.timestamp).toBe(100);
		expect(merged.actions.requestedAuthConfigs).toEqual({
			"1": { scheme: "a" },
			"2": { scheme: "b" },
		});
	});
});

describe("handleFunctionCallsAsync", () => {
	it("returns null for non-LlmAgent", async () => {
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({ name: "plain" }),
			functionCallEvent([{ name: "t", id: "1" }]),
			{},
		);
		expect(result).toBeNull();
	});

	it("executes tool and builds response for LlmAgent-like agent", async () => {
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Echoes input args" },
			async (args) => ({ echoed: args.value }),
		);
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([
				{ name: "echo_tool", id: "call-1", args: { value: "hi" } },
			]),
			{ echo_tool: tool },
		);

		expect(result).not.toBeNull();
		expect(result?.author).toBe("llm-agent");
		expect(result?.getFunctionResponses()[0]).toMatchObject({
			name: "echo_tool",
			id: "call-1",
			response: { echoed: "hi" },
		});
	});

	it("filters function calls by id set", async () => {
		const tool = new FakeTool({
			name: "echo_tool",
			description: "Echoes input args",
		});
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([
				{ name: "echo_tool", id: "keep", args: { n: 1 } },
				{ name: "echo_tool", id: "skip", args: { n: 2 } },
			]),
			{ echo_tool: tool },
			new Set(["keep"]),
		);

		expect(result?.getFunctionResponses()).toHaveLength(1);
		expect(result?.getFunctionResponses()[0].id).toBe("keep");
	});

	it("beforeToolCallback override skips tool execution", async () => {
		const runAsync = vi.fn(async () => ({ ran: true }));
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Echoes input args" },
			runAsync,
		);
		const before = vi.fn(async () => ({ overridden: true }));

		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [before],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "echo_tool", id: "c1", args: {} }]),
			{ echo_tool: tool },
		);

		expect(runAsync).not.toHaveBeenCalled();
		expect(before).toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			overridden: true,
		});
	});

	it("afterToolCallback can modify tool result", async () => {
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Echoes input args" },
			async () => ({ original: true }),
		);
		const after = vi.fn(async () => ({ modified: true }));

		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [after],
			}),
			functionCallEvent([{ name: "echo_tool", id: "c1", args: {} }]),
			{ echo_tool: tool },
		);

		expect(after).toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			modified: true,
		});
	});

	it("throws for unknown tool", async () => {
		await expect(
			handleFunctionCallsAsync(
				makeInvocationContext({
					name: "llm-agent",
					canonicalModel: "gpt-4o",
					canonicalBeforeToolCallbacks: [],
					canonicalAfterToolCallbacks: [],
				}),
				functionCallEvent([{ name: "missing", id: "c1" }]),
				{},
			),
		).rejects.toThrow(/Function missing is not found in the tools_dict/);
	});
});
