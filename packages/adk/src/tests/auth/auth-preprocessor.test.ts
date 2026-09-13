import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { requestProcessor } from "../../auth/auth-preprocessor";
import { Event } from "../../events/event";
import { REQUEST_EUC_FUNCTION_CALL_NAME } from "../../flows/llm-flows/functions";
import { LlmRequest } from "../../models/llm-request";

const handleFunctionCallsAsyncMock = vi.hoisted(() => vi.fn());

vi.mock("../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

vi.mock("../../flows/llm-flows/functions", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../flows/llm-flows/functions")>();
	return {
		...actual,
		handleFunctionCallsAsync: handleFunctionCallsAsyncMock,
	};
});

beforeEach(() => {
	handleFunctionCallsAsyncMock.mockReset();
});

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
		agent: overrides.agent ?? {
			name: "auth-agent",
			canonicalTools: async () => [],
		},
		session: {
			events: overrides.events ?? [],
			state: overrides.state ?? {},
		},
		runConfig: {},
	} as unknown as InvocationContext;
}

describe("auth requestProcessor", () => {
	it("returns immediately for agents without canonicalTools", async () => {
		const llmRequest = new LlmRequest();
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({ agent: { name: "plain" } }),
				llmRequest,
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

	it("warns on invalid auth response JSON and continues without yielding", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const eucResponse = new Event({
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

		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({ events: [eucResponse] }),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("warns when EUC functionCall args are not JSON and finds no tools to resume", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const eucCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "euc-1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: "not-json" as any,
						},
					},
				],
			},
		});
		const eucResponse = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-1",
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
				baseCtx({ events: [eucCall, eucResponse] }),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("yields resumed function response when EUC chain matches a prior tool call", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const resumed = new Event({
			author: "auth-agent",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "tool-1",
							name: "secure_api",
							response: { ok: true },
						},
					},
				],
			},
		});
		handleFunctionCallsAsyncMock.mockResolvedValue(resumed);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-1",
							name: "secure_api",
							args: { q: "x" },
						},
					},
				],
			},
		});
		const eucCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "euc-1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-1",
								auth_config: { authScheme: { type: "apiKey" } },
							}) as any,
						},
					},
				],
			},
		});
		const eucResponse = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: JSON.stringify({
								authScheme: { type: "oauth2" },
								rawAuthCredential: { accessToken: "t" },
								context: { credentialKey: "temp:cred-1" },
							}),
						},
					},
				],
			},
		});

		const tool = { name: "secure_api" };
		const canonicalTools = vi.fn(async () => [tool]);
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					agent: { name: "auth-agent", canonicalTools },
					events: [originalCall, eucCall, eucResponse],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([resumed]);
		expect(canonicalTools).toHaveBeenCalled();
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			originalCall,
			{ secure_api: tool },
			new Set(["tool-1"]),
		);
		warn.mockRestore();
	});

	it("returns without yielding when handleFunctionCallsAsync returns null", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-2",
							name: "secure_api",
							args: {},
						},
					},
				],
			},
		});
		const eucCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "euc-2",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({ function_call_id: "tool-2" }) as any,
						},
					},
				],
			},
		});
		const eucResponse = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-2",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: JSON.stringify({
								authScheme: { type: "openIdConnect" },
								rawAuthCredential: {},
							}),
						},
					},
				],
			},
		});

		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					events: [originalCall, eucCall, eucResponse],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("skips prior events without function calls while scanning for resume targets", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const filler = new Event({
			author: "auth-agent",
			content: { role: "model", parts: [{ text: "thinking" }] },
		});
		const eucCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "euc-3",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({ function_call_id: "missing" }) as any,
						},
					},
				],
			},
		});
		const eucResponse = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-3",
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
				baseCtx({ events: [filler, eucCall, eucResponse] }),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("ignores non-EUC function responses on the latest user event while still resuming", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-mix",
							name: "secure_api",
							args: {},
						},
					},
				],
			},
		});
		const eucCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "euc-mix",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-mix",
								auth_config: { authScheme: { type: "apiKey" } },
							}) as any,
						},
					},
				],
			},
		});
		const eucResponse = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "other-fr",
							name: "unrelated_tool",
							response: { ignored: true },
						},
					},
					{
						functionResponse: {
							id: "euc-mix",
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

		const tool = { name: "secure_api" };
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					agent: {
						name: "auth-agent",
						canonicalTools: async () => [tool],
					},
					events: [originalCall, eucCall, eucResponse],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			originalCall,
			{ secure_api: tool },
			new Set(["tool-mix"]),
		);
		warn.mockRestore();
	});
});
