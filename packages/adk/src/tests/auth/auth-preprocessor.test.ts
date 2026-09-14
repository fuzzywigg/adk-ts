import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { AuthConfig } from "../../auth/auth-config";
import { AuthHandler } from "../../auth/auth-handler";
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

describe("auth requestProcessor.parseAndStoreAuthResponse", () => {
	function callStore(
		authHandler: AuthHandler,
		invocationContext: InvocationContext,
	): void {
		(requestProcessor as any).parseAndStoreAuthResponse(
			authHandler,
			invocationContext,
		);
	}

	it("prefixes non-temp credentialKey values with temp:", () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "my-cred" },
			}),
			credential: { apiKey: "secret" } as any,
		});

		callStore(authHandler, baseCtx({ state }));

		expect(state["temp:my-cred"]).toEqual({ apiKey: "secret" });
		expect(state["my-cred"]).toBeUndefined();
	});

	it("keeps credentialKey values that already start with temp:", () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "temp:already" },
			}),
			credential: { token: "abc" } as any,
		});

		callStore(authHandler, baseCtx({ state }));

		expect(state["temp:already"]).toEqual({ token: "abc" });
		expect(Object.keys(state)).toEqual(["temp:already"]);
	});

	it("defaults credentialKey to a temp: timestamp when context omits it", () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
			}),
			credential: { apiKey: "k" } as any,
		});

		const before = Date.now();
		callStore(authHandler, baseCtx({ state }));
		const after = Date.now();

		const keys = Object.keys(state);
		expect(keys).toHaveLength(1);
		expect(keys[0].startsWith("temp:")).toBe(true);
		const ts = Number(keys[0].slice("temp:".length));
		expect(ts).toBeGreaterThanOrEqual(before);
		expect(ts).toBeLessThanOrEqual(after);
		expect(state[keys[0]]).toEqual({ apiKey: "k" });
	});

	it("stores oauth2 credentials without throwing", () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "oauth2" } as any,
				context: { credentialKey: "temp:oauth" },
			}),
			credential: { accessToken: "tok" } as any,
		});

		expect(() => callStore(authHandler, baseCtx({ state }))).not.toThrow();
		expect(state["temp:oauth"]).toEqual({ accessToken: "tok" });
	});

	it("stores openIdConnect credentials without throwing", () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "openIdConnect" } as any,
				context: { credentialKey: "oidc-cred" },
			}),
			credential: { idToken: "idt" } as any,
		});

		expect(() => callStore(authHandler, baseCtx({ state }))).not.toThrow();
		expect(state["temp:oidc-cred"]).toEqual({ idToken: "idt" });
	});

	it("warns when session state assignment throws", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const state: Record<string, unknown> = {};
		Object.defineProperty(state, "temp:boom", {
			configurable: true,
			enumerable: true,
			get() {
				return undefined;
			},
			set() {
				throw new Error("state write failed");
			},
		});
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "temp:boom" },
			}),
			credential: { apiKey: "x" } as any,
		});

		expect(() => callStore(authHandler, baseCtx({ state }))).not.toThrow();
		expect(warn).toHaveBeenCalledWith(
			"Failed to store auth response:",
			expect.any(Error),
		);
		warn.mockRestore();
	});

	it("resumes only matching tool ids when EUC call event mixes other functionCalls", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-keep",
							name: "secure_api",
							args: {},
						},
					},
					{
						functionCall: {
							id: "tool-other",
							name: "other_api",
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
							id: "euc-partial",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-keep",
							}) as any,
						},
					},
					{
						functionCall: {
							id: "unrelated-fc",
							name: "noop",
							args: {},
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
							id: "euc-partial",
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
			new Set(["tool-keep"]),
		);
		warn.mockRestore();
	});
});

describe("auth requestProcessor leftover edges", () => {
	it("returns immediately when agent is null", async () => {
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({ agent: null as unknown as object }),
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
	});

	it("returns immediately when session.events is null", async () => {
		const ctx = baseCtx();
		(ctx.session as { events: Event[] | null }).events = null;
		const events = await collect(
			requestProcessor.runAsync(ctx, new LlmRequest()),
		);
		expect(events).toEqual([]);
	});

	it("skips events with falsy author while scanning for user EUC responses", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-falsy-author",
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
							id: "euc-falsy-author",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-falsy-author",
							}) as any,
						},
					},
				],
			},
		});
		const emptyAuthor = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "ignored",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: "{}",
						},
					},
				],
			},
		});
		(emptyAuthor as { author: string }).author = "";
		const eucResponse = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-falsy-author",
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
					events: [originalCall, eucCall, emptyAuthor, eucResponse],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			originalCall,
			{ secure_api: tool },
			new Set(["tool-falsy-author"]),
		);
		warn.mockRestore();
	});

	it("pins EnhancedAuthConfig constructor-without-new failure on runAsync parse path", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-ctor",
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
							id: "euc-ctor",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-ctor",
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
							id: "euc-ctor",
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

		const state: Record<string, unknown> = { keep: true };
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					agent: {
						name: "auth-agent",
						canonicalTools: async () => [{ name: "secure_api" }],
					},
					events: [originalCall, eucCall, eucResponse],
					state,
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(state).toEqual({ keep: true });
		expect(warn).toHaveBeenCalledWith(
			"Failed to parse auth response:",
			expect.objectContaining({
				message: expect.stringMatching(/Class constructor|cannot be invoked/i),
			}),
		);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("continues outer EUC scan when getFunctionCalls returns null", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-null-fc",
							name: "secure_api",
							args: {},
						},
					},
				],
			},
		});
		const nullFcEvent = new Event({
			author: "auth-agent",
			content: { role: "model", parts: [{ text: "placeholder" }] },
		});
		vi.spyOn(nullFcEvent, "getFunctionCalls").mockReturnValue(null as any);
		const eucCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "euc-null-fc",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-null-fc",
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
							id: "euc-null-fc",
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
					events: [originalCall, nullFcEvent, eucCall, eucResponse],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			originalCall,
			{ secure_api: tool },
			new Set(["tool-null-fc"]),
		);
		warn.mockRestore();
	});

	it("returns without handleFunctionCallsAsync when toolsToResume never match prior calls", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-unrelated",
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
							id: "euc-mismatch",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-missing",
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
							id: "euc-mismatch",
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
				baseCtx({
					events: [originalCall, eucCall, eucResponse],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("resumes multiple tools when the user event carries multiple EUC responses", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const resumed = new Event({
			author: "auth-agent",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "tool-a",
							name: "api_a",
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
							id: "tool-a",
							name: "api_a",
							args: {},
						},
					},
					{
						functionCall: {
							id: "tool-b",
							name: "api_b",
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
							id: "euc-a",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-a",
							}) as any,
						},
					},
					{
						functionCall: {
							id: "euc-b",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-b",
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
							id: "euc-a",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: JSON.stringify({
								authScheme: { type: "apiKey" },
								rawAuthCredential: { apiKey: "a" },
							}),
						},
					},
					{
						functionResponse: {
							id: "euc-b",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: JSON.stringify({
								authScheme: { type: "http" },
								rawAuthCredential: { token: "b" },
							}),
						},
					},
				],
			},
		});

		const tools = [{ name: "api_a" }, { name: "api_b" }];
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					agent: {
						name: "auth-agent",
						canonicalTools: async () => tools,
					},
					events: [originalCall, eucCall, eucResponse],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([resumed]);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			originalCall,
			{ api_a: tools[0], api_b: tools[1] },
			new Set(["tool-a", "tool-b"]),
		);
		warn.mockRestore();
	});

	it("skips EUC response ids that do not match any prior functionCall id", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-real",
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
							id: "euc-real",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-real",
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
							id: "euc-orphan",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: JSON.stringify({
								authScheme: { type: "apiKey" },
								rawAuthCredential: { apiKey: "k" },
							}),
						},
					},
					{
						functionResponse: {
							id: "euc-real",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: JSON.stringify({
								authScheme: { type: "apiKey" },
								rawAuthCredential: { apiKey: "k2" },
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
			new Set(["tool-real"]),
		);
		warn.mockRestore();
	});

	it("continues when an intermediate event has functionCalls that do not match EUC ids", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-skip-inter",
							name: "secure_api",
							args: {},
						},
					},
				],
			},
		});
		const distractor = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "other-fc",
							name: "other_tool",
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
							id: "euc-skip-inter",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-skip-inter",
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
							id: "euc-skip-inter",
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
					events: [originalCall, distractor, eucCall, eucResponse],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			originalCall,
			{ secure_api: tool },
			new Set(["tool-skip-inter"]),
		);
		warn.mockRestore();
	});

	it("skips empty originalFunctionCalls while searching for the matching prior tool call", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-empty-prior",
							name: "secure_api",
							args: {},
						},
					},
				],
			},
		});
		const emptyPrior = new Event({
			author: "auth-agent",
			content: { role: "model", parts: [{ text: "empty prior" }] },
		});
		vi.spyOn(emptyPrior, "getFunctionCalls").mockReturnValue([]);
		const eucCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "euc-empty-prior",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-empty-prior",
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
							id: "euc-empty-prior",
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
					events: [originalCall, emptyPrior, eucCall, eucResponse],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			originalCall,
			{ secure_api: tool },
			new Set(["tool-empty-prior"]),
		);
		warn.mockRestore();
	});

	it("returns early after finding toolsToResume when no earlier original call exists", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const eucCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "euc-no-orig",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-ghost",
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
							id: "euc-no-orig",
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
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("pins constructor failure for oauth2 JSON auth responses on runAsync", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-oauth-pin",
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
							id: "euc-oauth-pin",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-oauth-pin",
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
							id: "euc-oauth-pin",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: JSON.stringify({
								authScheme: { type: "oauth2" },
								rawAuthCredential: { accessToken: "t" },
							}),
						},
					},
				],
			},
		});

		const state: Record<string, unknown> = {};
		await collect(
			requestProcessor.runAsync(
				baseCtx({
					agent: {
						name: "auth-agent",
						canonicalTools: async () => [{ name: "secure_api" }],
					},
					events: [originalCall, eucCall, eucResponse],
					state,
				}),
				new LlmRequest(),
			),
		);

		expect(Object.keys(state)).toEqual([]);
		expect(warn).toHaveBeenCalledWith(
			"Failed to parse auth response:",
			expect.any(Error),
		);
		warn.mockRestore();
	});
});

describe("auth requestProcessor.parseAndStoreAuthResponse leftover edges", () => {
	function callStore(
		authHandler: AuthHandler,
		invocationContext: InvocationContext,
	): void {
		(requestProcessor as any).parseAndStoreAuthResponse(
			authHandler,
			invocationContext,
		);
	}

	it("stores undefined credential when AuthHandler has no credential", () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "temp:empty-cred" },
			}),
		});

		callStore(authHandler, baseCtx({ state }));
		expect(state["temp:empty-cred"]).toBeUndefined();
		expect(Object.keys(state)).toEqual(["temp:empty-cred"]);
	});

	it("defaults credentialKey when context.credentialKey is empty string", () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "" },
			}),
			credential: { apiKey: "k" } as any,
		});

		const before = Date.now();
		callStore(authHandler, baseCtx({ state }));
		const after = Date.now();

		const keys = Object.keys(state);
		expect(keys).toHaveLength(1);
		expect(keys[0].startsWith("temp:")).toBe(true);
		const ts = Number(keys[0].slice("temp:".length));
		expect(ts).toBeGreaterThanOrEqual(before);
		expect(ts).toBeLessThanOrEqual(after);
	});

	it("stores http scheme credentials without entering oauth exchange branches", () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "http" } as any,
				context: { credentialKey: "http-cred" },
			}),
			credential: { token: "bearer-x" } as any,
		});

		callStore(authHandler, baseCtx({ state }));
		expect(state["temp:http-cred"]).toEqual({ token: "bearer-x" });
	});

	it("warns Failed to store auth response when state setter throws via callStore", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const state: Record<string, unknown> = {};
		Object.defineProperty(state, "temp:store-fail", {
			configurable: true,
			enumerable: true,
			get() {
				return undefined;
			},
			set() {
				throw new TypeError("cannot assign auth");
			},
		});
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "temp:store-fail" },
			}),
			credential: { apiKey: "secret" } as any,
		});

		expect(() => callStore(authHandler, baseCtx({ state }))).not.toThrow();
		expect(warn).toHaveBeenCalledWith(
			"Failed to store auth response:",
			expect.objectContaining({ message: "cannot assign auth" }),
		);
		warn.mockRestore();
	});
});

describe("auth requestProcessor trailing scan leftovers", () => {
	it("skips trailing non-user and falsy-author events after user EUC then resumes", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-trailing",
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
							id: "euc-trailing",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-trailing",
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
							id: "euc-trailing",
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
		const trailingAgent = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [{ text: "trailing-model-noise" }],
			},
		});
		const trailingFalsy = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [{ text: "trailing-falsy" }],
			},
		});
		(trailingFalsy as { author: string }).author = "";

		const tool = { name: "secure_api" };
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					agent: {
						name: "auth-agent",
						canonicalTools: async () => [tool],
					},
					events: [
						originalCall,
						eucCall,
						eucResponse,
						trailingAgent,
						trailingFalsy,
					],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			originalCall,
			{ secure_api: tool },
			new Set(["tool-trailing"]),
		);
		expect(warn).toHaveBeenCalledWith(
			"Failed to parse auth response:",
			expect.any(Error),
		);
		warn.mockRestore();
	});

	it("warns on EnhancedAuthConfig parse failure when EUC response JSON is malformed", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const originalCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-bad-json",
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
							id: "euc-bad-json",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "tool-bad-json",
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
							id: "euc-bad-json",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: "{not-valid-json",
						},
					},
				],
			},
		});

		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					agent: {
						name: "auth-agent",
						canonicalTools: async () => [{ name: "secure_api" }],
					},
					events: [originalCall, eucCall, eucResponse],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		expect(warn).toHaveBeenCalledWith(
			"Failed to parse auth response:",
			expect.any(SyntaxError),
		);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalled();
		warn.mockRestore();
	});
});
