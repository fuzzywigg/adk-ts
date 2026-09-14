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
	handleFunctionCallsLive,
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
		getTracer: vi.fn(() => ({
			startSpan: () => ({
				setStatus: vi.fn(),
				recordException: vi.fn(),
				end: vi.fn(),
			}),
		})),
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

	it("returns null when event has no function calls", async () => {
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			new Event({
				author: "agent",
				content: { role: "model", parts: [{ text: "no tools" }] },
			}),
			{},
		);
		expect(result).toBeNull();
	});

	it("skips long-running tools that return a falsy result", async () => {
		const tool = new FakeTool(
			{
				name: "slow",
				description: "Long running tool",
				isLongRunning: true,
			},
			async () => null,
		);
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "slow", id: "lr-1" }]),
			{ slow: tool },
		);
		expect(result).toBeNull();
	});

	it("wraps primitive tool results as { result }", async () => {
		const tool = new FakeTool(
			{ name: "echo_tool", description: "returns string" },
			async () => "plain string",
		);
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "echo_tool", id: "c1", args: {} }]),
			{ echo_tool: tool },
		);
		expect(result?.getFunctionResponses()[0].response).toEqual({
			result: "plain string",
		});
	});

	it("records span exception and rethrows when tool throws", async () => {
		const recordException = vi.fn();
		const setStatus = vi.fn();
		const end = vi.fn();
		const { telemetryService } = await import("../../../telemetry");
		vi.mocked(telemetryService.getTracer).mockReturnValueOnce({
			startSpan: () => ({
				setStatus,
				recordException,
				end,
			}),
		} as any);

		const tool = new FakeTool(
			{ name: "boom", description: "throws" },
			async () => {
				throw new Error("tool failed");
			},
		);

		await expect(
			handleFunctionCallsAsync(
				makeInvocationContext({
					name: "llm-agent",
					canonicalModel: "gpt-4o",
					canonicalBeforeToolCallbacks: [],
					canonicalAfterToolCallbacks: [],
				}),
				functionCallEvent([{ name: "boom", id: "c1" }]),
				{ boom: tool },
			),
		).rejects.toThrow(/tool failed/);

		expect(recordException).toHaveBeenCalled();
		expect(setStatus).toHaveBeenCalledWith(
			expect.objectContaining({ code: 2, message: "tool failed" }),
		);
		expect(end).toHaveBeenCalled();
	});
});

describe("handleFunctionCallsLive", () => {
	it("delegates to the async handler", async () => {
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Echoes input args" },
			async (args) => ({ live: args.value }),
		);
		const result = await handleFunctionCallsLive(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([
				{ name: "echo_tool", id: "live-1", args: { value: 9 } },
			]),
			{ echo_tool: tool },
		);

		expect(result?.getFunctionResponses()[0]).toMatchObject({
			name: "echo_tool",
			id: "live-1",
			response: { live: 9 },
		});
	});
});

describe("function call helper edge cases", () => {
	it("populateClientFunctionCallId is a no-op without function calls", () => {
		const event = new Event({
			author: "agent",
			content: { role: "model", parts: [{ text: "hi" }] },
		});
		expect(() => populateClientFunctionCallId(event)).not.toThrow();
		expect(event.getFunctionCalls()).toEqual([]);
	});

	it("removeClientFunctionCallId tolerates missing parts", () => {
		expect(() =>
			removeClientFunctionCallId({ role: "user" } as any),
		).not.toThrow();
		expect(() => removeClientFunctionCallId(undefined as any)).not.toThrow();
	});

	it("generateAuthEvent builds multiple REQUEST_EUC calls", () => {
		const event = new Event({
			author: "agent",
			content: { role: "user", parts: [] },
			actions: new EventActions({
				requestedAuthConfigs: {
					"fc-1": { authScheme: { type: "oauth2" } },
					"fc-2": { authScheme: { type: "apiKey" } },
				},
			}),
		});

		const authEvent = generateAuthEvent(
			makeInvocationContext({ name: "auth-agent" }),
			event,
		);

		expect(authEvent?.getFunctionCalls()).toHaveLength(2);
		expect(authEvent?.longRunningToolIds?.size).toBe(2);
		const callIds = authEvent
			?.getFunctionCalls()
			.map(
				(call) => (call.args as { function_call_id?: string }).function_call_id,
			)
			.sort();
		expect(callIds).toEqual(["fc-1", "fc-2"]);
	});

	it("mergeParallelFunctionResponseEvents skips events without parts", () => {
		const withParts = new Event({
			author: "agent",
			timestamp: 42,
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "a",
							id: "1",
							response: { ok: true },
						},
					},
				],
			},
		});
		const withoutParts = new Event({
			author: "agent",
			content: { role: "user" } as any,
		});

		const merged = mergeParallelFunctionResponseEvents([
			withParts,
			withoutParts,
		]);
		expect(merged.content?.parts).toHaveLength(1);
		expect(merged.timestamp).toBe(42);
	});
});

describe("handleFunctionCallsAsync callback and filter edges", () => {
	it("continues to tool when beforeToolCallback returns null/undefined", async () => {
		const runAsync = vi.fn(async () => ({ ran: true }));
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Echoes input args" },
			runAsync,
		);
		const beforeNull = vi.fn(async () => null);
		const beforeUndefined = vi.fn(async () => undefined);

		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [beforeNull, beforeUndefined],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "echo_tool", id: "c1", args: { x: 1 } }]),
			{ echo_tool: tool },
		);

		expect(runAsync).toHaveBeenCalledWith({ x: 1 });
		expect(result?.getFunctionResponses()[0].response).toEqual({ ran: true });
	});

	it("keeps original result when afterToolCallback returns null", async () => {
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Echoes input args" },
			async () => ({ original: true }),
		);
		const after = vi.fn(async () => null);

		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [after],
			}),
			functionCallEvent([{ name: "echo_tool", id: "c1" }]),
			{ echo_tool: tool },
		);

		expect(after).toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			original: true,
		});
	});

	it("returns null when filter excludes every call", async () => {
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
				{ name: "echo_tool", id: "a" },
				{ name: "echo_tool", id: "b" },
			]),
			{ echo_tool: tool },
			new Set(["never"]),
		);
		expect(result).toBeNull();
	});

	it("defaults missing args to empty object", async () => {
		const runAsync = vi.fn(async (args) => ({ got: args }));
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Echoes input args" },
			runAsync,
		);
		const event = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							name: "echo_tool",
							id: "c1",
						},
					},
				],
			},
		});

		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			event,
			{ echo_tool: tool },
		);

		expect(runAsync).toHaveBeenCalledWith({});
		expect(result?.getFunctionResponses()[0].response).toEqual({ got: {} });
	});

	it("wraps numeric and nullish non-object results", async () => {
		const numberTool = new FakeTool(
			{ name: "num", description: "returns number" },
			async () => 0,
		);
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "num", id: "n1" }]),
			{ num: numberTool },
		);
		expect(result?.getFunctionResponses()[0].response).toEqual({ result: 0 });
	});

	it("merges parallel tool responses into one event", async () => {
		const a = new FakeTool(
			{ name: "a", description: "Tool A helper" },
			async () => ({ a: 1 }),
		);
		const b = new FakeTool(
			{ name: "b", description: "Tool B helper" },
			async () => ({ b: 2 }),
		);
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([
				{ name: "a", id: "1" },
				{ name: "b", id: "2" },
			]),
			{ a, b },
		);

		expect(result?.getFunctionResponses()).toHaveLength(2);
		expect(
			result
				?.getFunctionResponses()
				.map((r) => r.name)
				.sort(),
		).toEqual(["a", "b"]);
	});

	it("skips long-running falsy among mixed calls and keeps others", async () => {
		const slow = new FakeTool(
			{
				name: "slow",
				description: "Long running tool",
				isLongRunning: true,
			},
			async () => undefined,
		);
		const fast = new FakeTool(
			{ name: "fast", description: "Quick tool helper" },
			async () => ({ ok: true }),
		);
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([
				{ name: "slow", id: "lr" },
				{ name: "fast", id: "f" },
			]),
			{ slow, fast },
		);

		expect(result?.getFunctionResponses()).toHaveLength(1);
		expect(result?.getFunctionResponses()[0].id).toBe("f");
	});

	it("still runs calls that lack an id even when filters are set", async () => {
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Echoes input args" },
			async () => ({ ran: true }),
		);
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "echo_tool", args: { x: 1 } }]),
			{ echo_tool: tool },
			new Set(["other-id"]),
		);

		expect(result?.getFunctionResponses()[0].response).toEqual({ ran: true });
	});

	it("uses the first truthy afterToolCallback and skips later ones", async () => {
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Echoes input args" },
			async () => ({ original: true }),
		);
		const first = vi.fn(async () => null);
		const second = vi.fn(async () => ({ overridden: true }));
		const third = vi.fn(async () => ({ never: true }));

		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [first, second, third],
			}),
			functionCallEvent([{ name: "echo_tool", id: "c1" }]),
			{ echo_tool: tool },
		);

		expect(first).toHaveBeenCalled();
		expect(second).toHaveBeenCalled();
		expect(third).not.toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			overridden: true,
		});
	});

	it("uses the first truthy beforeToolCallback and skips later ones and tool", async () => {
		const runAsync = vi.fn(async () => ({ shouldNotRun: true }));
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Echoes input args" },
			runAsync,
		);
		const first = vi.fn(async () => null);
		const second = vi.fn(async () => ({ fromBefore: true }));
		const third = vi.fn(async () => ({ never: true }));

		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [first, second, third],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "echo_tool", id: "c1" }]),
			{ echo_tool: tool },
		);

		expect(first).toHaveBeenCalled();
		expect(second).toHaveBeenCalled();
		expect(third).not.toHaveBeenCalled();
		expect(runAsync).not.toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			fromBefore: true,
		});
	});

	it("wraps false and empty-string results as { result }", async () => {
		const falseTool = new FakeTool(
			{ name: "false_tool", description: "returns false" },
			async () => false,
		);
		const emptyTool = new FakeTool(
			{ name: "empty_tool", description: "returns empty string" },
			async () => "",
		);

		const falseResult = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "false_tool", id: "f1" }]),
			{ false_tool: falseTool },
		);
		expect(falseResult?.getFunctionResponses()[0].response).toEqual({
			result: false,
		});

		const emptyResult = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "empty_tool", id: "e1" }]),
			{ empty_tool: emptyTool },
		);
		expect(emptyResult?.getFunctionResponses()[0].response).toEqual({
			result: "",
		});
	});

	it("keeps array tool results unwrapped", async () => {
		const tool = new FakeTool(
			{ name: "list_tool", description: "returns array" },
			async () => [1, 2, 3],
		);
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "list_tool", id: "a1" }]),
			{ list_tool: tool },
		);
		expect(result?.getFunctionResponses()[0].response).toEqual([1, 2, 3]);
	});

	it("propagates toolContext actions onto the response event", async () => {
		class HandoffTool extends BaseTool {
			async runAsync(_args: Record<string, any>, context: ToolContext) {
				context.actions.transferToAgent = "specialist";
				return { handedOff: true };
			}
		}
		const tool = new HandoffTool({
			name: "handoff",
			description: "transfers",
		});

		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "handoff", id: "h1" }]),
			{ handoff: tool },
		);

		expect(result?.actions.transferToAgent).toBe("specialist");
		expect(result?.getFunctionResponses()[0].response).toEqual({
			handedOff: true,
		});
	});

	it("generateAuthEvent copies content.role from the function response event", () => {
		const event = new Event({
			author: "agent",
			content: { role: "model", parts: [] },
			actions: new EventActions({
				requestedAuthConfigs: {
					"fc-role": { authScheme: { type: "oauth2" } },
				},
			}),
		});

		const authEvent = generateAuthEvent(
			makeInvocationContext({ name: "auth-agent" }),
			event,
		);

		expect(authEvent?.content?.role).toBe("model");
	});

	it("returns null when every long-running tool returns falsy", async () => {
		const slowA = new FakeTool(
			{
				name: "slow_a",
				description: "Long running A",
				isLongRunning: true,
			},
			async () => null,
		);
		const slowB = new FakeTool(
			{
				name: "slow_b",
				description: "Long running B",
				isLongRunning: true,
			},
			async () => undefined,
		);

		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([
				{ name: "slow_a", id: "a" },
				{ name: "slow_b", id: "b" },
			]),
			{ slow_a: slowA, slow_b: slowB },
		);

		expect(result).toBeNull();
	});
});
