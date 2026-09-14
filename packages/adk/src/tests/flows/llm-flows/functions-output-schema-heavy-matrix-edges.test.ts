import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { EventActions } from "../../../events/event-actions";
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
import { responseProcessor } from "../../../flows/llm-flows/output-schema";
import { LlmResponse } from "../../../models/llm-response";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";

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

async function collect(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<unknown[]> {
	const items: unknown[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

function makeContext(agent: Record<string, unknown>): InvocationContext {
	return {
		invocationId: "inv-1",
		branch: "main",
		agent,
	} as unknown as InvocationContext;
}

describe("functions helpers heavy matrix", () => {
	it("exports AF_FUNCTION_CALL_ID_PREFIX and REQUEST_EUC name", () => {
		expect(AF_FUNCTION_CALL_ID_PREFIX).toBe("adk-");
		expect(REQUEST_EUC_FUNCTION_CALL_NAME).toBe("adk_request_credential");
	});

	it.each([
		1, 2, 3,
	])("generateClientFunctionCallId starts with adk- (sample %s)", () => {
		expect(generateClientFunctionCallId().startsWith("adk-")).toBe(true);
	});

	it("populateClientFunctionCallId fills missing ids only", () => {
		const event = functionCallEvent([
			{ name: "a", id: "keep" },
			{ name: "b" },
			{ name: "c", id: "" },
		]);
		populateClientFunctionCallId(event);
		const calls = event.getFunctionCalls();
		expect(calls[0].id).toBe("keep");
		expect(calls[1].id?.startsWith("adk-")).toBe(true);
		expect(calls[2].id?.startsWith("adk-") || calls[2].id === "").toBe(true);
	});

	it("removeClientFunctionCallId strips only adk- prefixes", () => {
		const content = {
			role: "user" as const,
			parts: [
				{ functionCall: { name: "a", id: "adk-1" } },
				{ functionCall: { name: "b", id: "server" } },
				{
					functionResponse: {
						name: "a",
						id: "adk-2",
						response: {},
					},
				},
			],
		};
		removeClientFunctionCallId(content);
		expect(content.parts[0].functionCall?.id).toBeUndefined();
		expect(content.parts[1].functionCall?.id).toBe("server");
		expect(content.parts[2].functionResponse?.id).toBeUndefined();
	});

	it("getLongRunningFunctionCalls returns only matching long-running ids", () => {
		const toolsDict = {
			slow: new FakeTool({
				name: "slow",
				description: "slow",
				isLongRunning: true,
			}),
			fast: new FakeTool({ name: "fast", description: "fast" }),
		};
		const ids = getLongRunningFunctionCalls(
			[
				{ name: "slow", id: "1" },
				{ name: "fast", id: "2" },
				{ name: "slow", id: "3" },
				{ name: "missing", id: "4" },
			],
			toolsDict,
		);
		expect([...ids].sort()).toEqual(["1", "3"]);
	});

	it("generateAuthEvent returns null without configs", () => {
		expect(
			generateAuthEvent(
				makeInvocationContext({ name: "a" }),
				new Event({
					author: "a",
					actions: new EventActions(),
					content: { role: "user", parts: [] },
				}),
			),
		).toBeNull();
	});

	it("generateAuthEvent builds one REQUEST_EUC per auth config", () => {
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
		expect(
			authEvent
				?.getFunctionCalls()
				.every((c) => c.name === REQUEST_EUC_FUNCTION_CALL_NAME),
		).toBe(true);
	});

	it("mergeParallelFunctionResponseEvents throws on empty", () => {
		expect(() => mergeParallelFunctionResponseEvents([])).toThrow(
			/No function response events provided/,
		);
	});

	it("mergeParallelFunctionResponseEvents returns single unchanged", () => {
		const single = new Event({
			author: "agent",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: { name: "t", id: "1", response: { a: 1 } },
					},
				],
			},
		});
		expect(mergeParallelFunctionResponseEvents([single])).toBe(single);
	});

	it("mergeParallelFunctionResponseEvents merges parts and auth", () => {
		const first = new Event({
			author: "agent",
			timestamp: 10,
			content: {
				role: "user",
				parts: [
					{
						functionResponse: { name: "a", id: "1", response: { a: 1 } },
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
						functionResponse: { name: "b", id: "2", response: { b: 2 } },
					},
				],
			},
			actions: new EventActions({
				requestedAuthConfigs: { "2": { scheme: "b" } },
			}),
		});
		const merged = mergeParallelFunctionResponseEvents([first, second]);
		expect(merged.content?.parts).toHaveLength(2);
		expect(merged.timestamp).toBe(10);
		expect(merged.actions.requestedAuthConfigs).toEqual({
			"1": { scheme: "a" },
			"2": { scheme: "b" },
		});
	});

	it("handleFunctionCallsAsync returns null for non-LlmAgent", async () => {
		expect(
			await handleFunctionCallsAsync(
				makeInvocationContext({ name: "plain" }),
				functionCallEvent([{ name: "t", id: "1" }]),
				{},
			),
		).toBeNull();
	});

	it("handleFunctionCallsAsync executes tool for LlmAgent-like agent", async () => {
		const tool = new FakeTool(
			{ name: "echo", description: "echo" },
			async (args) => ({ echoed: args.v }),
		);
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "echo", id: "c1", args: { v: 1 } }]),
			{ echo: tool },
		);
		expect(result?.getFunctionResponses()[0].response).toEqual({ echoed: 1 });
	});

	it("handleFunctionCallsAsync filters by id set", async () => {
		const tool = new FakeTool({ name: "echo", description: "echo" });
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([
				{ name: "echo", id: "keep" },
				{ name: "echo", id: "skip" },
			]),
			{ echo: tool },
			new Set(["keep"]),
		);
		expect(result?.getFunctionResponses()).toHaveLength(1);
		expect(result?.getFunctionResponses()[0].id).toBe("keep");
	});

	it("handleFunctionCallsAsync wraps primitive results", async () => {
		const tool = new FakeTool(
			{ name: "echo", description: "echo" },
			async () => "plain",
		);
		const result = await handleFunctionCallsAsync(
			makeInvocationContext({
				name: "llm",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "echo", id: "c1" }]),
			{ echo: tool },
		);
		expect(result?.getFunctionResponses()[0].response).toEqual({
			result: "plain",
		});
	});

	it("handleFunctionCallsLive delegates to async path", async () => {
		const tool = new FakeTool(
			{ name: "echo", description: "echo" },
			async (args) => ({ live: args.n }),
		);
		const result = await handleFunctionCallsLive(
			makeInvocationContext({
				name: "llm",
				canonicalModel: "gpt-4o",
				canonicalBeforeToolCallbacks: [],
				canonicalAfterToolCallbacks: [],
			}),
			functionCallEvent([{ name: "echo", id: "l1", args: { n: 9 } }]),
			{ echo: tool },
		);
		expect(result?.getFunctionResponses()[0].response).toEqual({ live: 9 });
	});

	it("handleFunctionCallsAsync throws for unknown tool", async () => {
		await expect(
			handleFunctionCallsAsync(
				makeInvocationContext({
					name: "llm",
					canonicalModel: "gpt-4o",
					canonicalBeforeToolCallbacks: [],
					canonicalAfterToolCallbacks: [],
				}),
				functionCallEvent([{ name: "missing", id: "c1" }]),
				{},
			),
		).rejects.toThrow(/not found in the tools_dict/);
	});
});

describe("output-schema responseProcessor heavy matrix", () => {
	it("returns early when response has no content", async () => {
		expect(
			await collect(
				responseProcessor.runAsync(
					makeContext({ name: "a", outputSchema: z.object({}) }),
					new LlmResponse(),
				),
			),
		).toEqual([]);
	});

	it("returns early when agent has no outputSchema", async () => {
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: '{"a":1}' }] },
		});
		expect(
			await collect(
				responseProcessor.runAsync(makeContext({ name: "a" }), response),
			),
		).toEqual([]);
	});

	it.each([
		['{"answer":"ok"}', { answer: "ok" }],
		['```json\n{"answer":"fenced"}\n```', { answer: "fenced" }],
		['```\n{"answer":"bare"}\n```', { answer: "bare" }],
		['Here is JSON:\n{"answer":"prose"}', { answer: "prose" }],
	])("validates JSON payload %j", async (text, expected) => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text }] },
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		expect(events).toEqual([]);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual(
			expected,
		);
	});

	it("repairs mildly invalid JSON", async () => {
		const schema = z.object({ value: z.number() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: "{value: 7}" }] },
		});
		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			value: 7,
		});
	});

	it("yields error event on schema validation failure", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: '{"answer":123}' }] },
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		expect(events).toHaveLength(1);
		expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
	});

	it("yields parse error for unrepaired JSON", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: "not-json {{{" }] },
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		expect(events).toHaveLength(1);
		expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
	});

	it("skips whitespace-only content", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: "   \n  " }] },
		});
		expect(
			await collect(
				responseProcessor.runAsync(
					makeContext({ name: "schema-agent", outputSchema: schema }),
					response,
				),
			),
		).toEqual([]);
	});

	it("ignores non-text parts when joining response text", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [
					{ inlineData: { mimeType: "image/png", data: "abc" } } as any,
					{ text: '{"answer":"ok"}' },
				],
			},
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		expect(events).toEqual([]);
		expect(response.content?.parts?.[0]).toMatchObject({
			inlineData: { mimeType: "image/png", data: "abc" },
		});
	});

	it("validates nested object schemas", async () => {
		const schema = z.object({
			user: z.object({ name: z.string(), age: z.number() }),
		});
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"user":{"name":"Ada","age":36}}' }],
			},
		});
		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			user: { name: "Ada", age: 36 },
		});
	});

	it("fails nested schema when inner type mismatches", async () => {
		const schema = z.object({
			user: z.object({ name: z.string() }),
		});
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"user":{"name":1}}' }],
			},
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		expect(events).toHaveLength(1);
		expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
	});
});
