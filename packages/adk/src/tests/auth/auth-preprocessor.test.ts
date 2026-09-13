import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { requestProcessor } from "../../auth/auth-preprocessor";
import { Event } from "../../events/event";
import { REQUEST_EUC_FUNCTION_CALL_NAME } from "../../flows/llm-flows/functions";
import { LlmRequest } from "../../models/llm-request";
import { BaseTool } from "../../tools/base/base-tool";
import type { ToolContext } from "../../tools/tool-context";

vi.mock("../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

vi.mock("../../telemetry", () => ({
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

class ResumeTool extends BaseTool {
	calls: Record<string, any>[] = [];

	constructor() {
		super({ name: "secure_lookup", description: "test tool" });
	}

	async runAsync(args: Record<string, any>, _context: ToolContext) {
		this.calls.push(args);
		return { ok: true, args };
	}
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

function baseCtx(
	overrides: Partial<{
		agent: object;
		events: Event[];
		state: Record<string, unknown>;
	}> = {},
): InvocationContext {
	return {
		invocationId: "inv-1",
		branch: "main",
		agent: overrides.agent ?? {
			name: "auth-agent",
			canonicalTools: async () => [],
		},
		userId: "u1",
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: overrides.state ?? {},
			events: overrides.events ?? [],
			lastUpdateTime: 0,
		},
		runConfig: {},
	} as unknown as InvocationContext;
}

describe("auth requestProcessor", () => {
	it("returns immediately for agents without canonicalTools", async () => {
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({ agent: { name: "plain" } }),
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
	});

	it("returns immediately when session has no events", async () => {
		const events = await collect(
			requestProcessor.runAsync(baseCtx({ events: [] }), new LlmRequest()),
		);
		expect(events).toEqual([]);
	});

	it("returns when the latest user event has no function responses", async () => {
		const user = new Event({
			author: "user",
			content: { role: "user", parts: [{ text: "hello" }] },
		});
		const events = await collect(
			requestProcessor.runAsync(baseCtx({ events: [user] }), new LlmRequest()),
		);
		expect(events).toEqual([]);
	});

	it("returns when user responses are not request-credential EUC", async () => {
		const user = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "fr-1",
							name: "other_tool",
							response: { ok: true },
						},
					},
				],
			},
		});
		const events = await collect(
			requestProcessor.runAsync(baseCtx({ events: [user] }), new LlmRequest()),
		);
		expect(events).toEqual([]);
	});

	it("ignores non-user events while scanning backwards for auth responses", async () => {
		const agentEvt = new Event({
			author: "assistant",
			content: {
				role: "model",
				parts: [
					{
						functionResponse: {
							id: "fr-1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: "{}",
						},
					},
				],
			},
		});
		const user = new Event({
			author: "user",
			content: { role: "user", parts: [{ text: "hi" }] },
		});

		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({ events: [agentEvt, user] }),
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
	});

	it("does not yield when EUC response is present but no matching prior call exists", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const eucResponse = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-resp",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: JSON.stringify({
								authScheme: { type: "apiKey" },
								rawAuthCredential: { apiKey: "k" },
							}),
						},
					},
				],
			},
		});

		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({ events: [eucResponse] }),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		warn.mockRestore();
	});

	it("resumes original tool calls after EUC user response", async () => {
		const tool = new ResumeTool();
		const originalCall = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "orig-1",
							name: "secure_lookup",
							args: { q: "secret" },
						},
					},
				],
			},
		});
		const eucCall = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "euc-1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "orig-1",
								auth_config: { authScheme: { type: "apiKey" } },
							}),
						},
					},
				],
			},
		});
		const userEucResponse = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: JSON.stringify({
								authScheme: { type: "apiKey", in: "header", name: "X-Key" },
							}),
						},
					},
				],
			},
		});

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					agent: {
						name: "llm",
						canonicalModel: "fake-model",
						canonicalBeforeToolCallbacks: [],
						canonicalAfterToolCallbacks: [],
						canonicalTools: async () => [tool],
					},
					events: [originalCall, eucCall, userEucResponse],
				}),
				new LlmRequest(),
			),
		);
		warnSpy.mockRestore();

		expect(events).toHaveLength(1);
		expect(tool.calls).toEqual([{ q: "secret" }]);
		const responseEvent = events[0] as Event;
		expect(responseEvent.getFunctionResponses()[0]?.name).toBe("secure_lookup");
	});

	it("warns and continues when auth response JSON is malformed", async () => {
		const userEucResponse = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-bad",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: "{not-json",
						},
					},
				],
			},
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					agent: {
						name: "llm",
						canonicalTools: async () => [],
					},
					events: [userEucResponse],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});
});
