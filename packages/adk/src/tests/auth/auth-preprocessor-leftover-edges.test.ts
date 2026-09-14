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

function eucUserResponse(
	id: string,
	response: string | Record<string, unknown>,
): Event {
	return new Event({
		author: "user",
		content: {
			role: "user",
			parts: [
				{
					functionResponse: {
						id,
						name: REQUEST_EUC_FUNCTION_CALL_NAME,
						response: response as any,
					},
				},
			],
		},
	});
}

function eucSystemCall(id: string, args: unknown): Event {
	return new Event({
		author: "auth-agent",
		content: {
			role: "model",
			parts: [
				{
					functionCall: {
						id,
						name: REQUEST_EUC_FUNCTION_CALL_NAME,
						args: args as any,
					},
				},
			],
		},
	});
}

function toolCall(id: string, name = "secure_api"): Event {
	return new Event({
		author: "auth-agent",
		content: {
			role: "model",
			parts: [
				{
					functionCall: {
						id,
						name,
						args: { q: "x" },
					},
				},
			],
		},
	});
}

function callStore(
	authHandler: AuthHandler,
	invocationContext: InvocationContext,
): void {
	(requestProcessor as any).parseAndStoreAuthResponse(
		authHandler,
		invocationContext,
	);
}

describe("auth-preprocessor leftover: empty EUC id set early return", () => {
	const nonEucNames = [
		"other_tool",
		"search",
		"http_request",
		"unrelated",
		"",
		"request_credential_typo",
	];

	for (const name of nonEucNames) {
		it(`returns with empty set when latest user responses are only "${name}"`, async () => {
			const user = new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: `fr-${name || "empty"}`,
								name,
								response: { ok: true },
							},
						},
					],
				},
			});
			const events = await collect(
				requestProcessor.runAsync(
					baseCtx({ events: [user] }),
					new LlmRequest(),
				),
			);
			expect(events).toEqual([]);
			expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
		});
	}

	it("returns empty when mixed non-EUC responses leave the id set empty", async () => {
		const user = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "a",
							name: "tool_a",
							response: {},
						},
					},
					{
						functionResponse: {
							id: "b",
							name: "tool_b",
							response: {},
						},
					},
				],
			},
		});
		expect(
			await collect(
				requestProcessor.runAsync(
					baseCtx({ events: [user] }),
					new LlmRequest(),
				),
			),
		).toEqual([]);
	});
});

describe("auth-preprocessor leftover: id not in requestEucFunctionCallIds set", () => {
	const mismatchPairs = [
		{ responseId: "euc-a", callId: "euc-b" },
		{ responseId: "euc-1", callId: "euc-2" },
		{ responseId: "resp", callId: "call" },
		{ responseId: "same-looking", callId: "same_looking" },
	];

	for (const { responseId, callId } of mismatchPairs) {
		it(`skips system EUC call id=${callId} when set only has ${responseId}`, async () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const events = await collect(
				requestProcessor.runAsync(
					baseCtx({
						events: [
							toolCall("tool-x"),
							eucSystemCall(
								callId,
								JSON.stringify({ function_call_id: "tool-x" }),
							),
							eucUserResponse(
								responseId,
								JSON.stringify({
									authScheme: { type: "apiKey" },
									rawAuthCredential: { apiKey: "k" },
								}),
							),
						],
					}),
					new LlmRequest(),
				),
			);
			expect(events).toEqual([]);
			expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
			warn.mockRestore();
		});
	}

	it("continues past unmatched sibling functionCalls on the EUC event", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const eucCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "not-in-set",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({ function_call_id: "tool-miss" }) as any,
						},
					},
					{
						functionCall: {
							id: "euc-hit",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({ function_call_id: "tool-hit" }) as any,
						},
					},
				],
			},
		});

		await collect(
			requestProcessor.runAsync(
				baseCtx({
					events: [
						toolCall("tool-hit"),
						eucCall,
						eucUserResponse(
							"euc-hit",
							JSON.stringify({
								authScheme: { type: "apiKey" },
								rawAuthCredential: { apiKey: "k" },
							}),
						),
					],
				}),
				new LlmRequest(),
			),
		);

		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.anything(),
			new Set(["tool-hit"]),
		);
		warn.mockRestore();
	});
});

describe("auth-preprocessor leftover: JSON parse fail arms", () => {
	const badResponses = [
		"{not-json",
		"null",
		"undefined",
		"[1,2,3]",
		'"just-a-string"',
		"{",
		"}",
		"",
	];

	for (const response of badResponses) {
		it(`warns and continues when EUC response JSON is ${JSON.stringify(response)}`, async () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const events = await collect(
				requestProcessor.runAsync(
					baseCtx({ events: [eucUserResponse("euc-bad", response)] }),
					new LlmRequest(),
				),
			);
			expect(events).toEqual([]);
			expect(warn).toHaveBeenCalled();
			warn.mockRestore();
		});
	}

	it("warns when functionResponse.response is a non-string object (JSON.parse TypeError)", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					events: [
						eucUserResponse("euc-obj", {
							authScheme: { type: "apiKey" },
						} as any),
					],
				}),
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
		expect(warn).toHaveBeenCalledWith(
			"Failed to parse auth response:",
			expect.anything(),
		);
		warn.mockRestore();
	});

	const badArgs = ["not-json", "{", "null", 42, { function_call_id: "t" }];

	for (const args of badArgs) {
		it(`empty toolsToResume when EUC args fail JSON.parse (${typeof args})`, async () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const events = await collect(
				requestProcessor.runAsync(
					baseCtx({
						events: [
							toolCall("tool-1"),
							eucSystemCall("euc-1", args),
							eucUserResponse(
								"euc-1",
								JSON.stringify({
									authScheme: { type: "apiKey" },
									rawAuthCredential: { apiKey: "k" },
								}),
							),
						],
					}),
					new LlmRequest(),
				),
			);
			expect(events).toEqual([]);
			expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
			warn.mockRestore();
		});
	}
});

describe("auth-preprocessor leftover: empty toolsToResume continue path", () => {
	it("continues outer scan when matched EUC id has only unparseable args", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const fillerCall = eucSystemCall("other-id", "nope");
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					events: [
						toolCall("t1"),
						fillerCall,
						eucSystemCall("euc-empty", "{bad"),
						eucUserResponse(
							"euc-empty",
							JSON.stringify({
								authScheme: { type: "apiKey" },
								rawAuthCredential: { apiKey: "k" },
							}),
						),
					],
				}),
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("skips events with empty functionCalls arrays while scanning", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const emptyCalls = new Event({
			author: "auth-agent",
			content: { role: "model", parts: [{ text: "no calls" }] },
		});
		expect(
			await collect(
				requestProcessor.runAsync(
					baseCtx({
						events: [
							emptyCalls,
							eucUserResponse(
								"euc-z",
								JSON.stringify({
									authScheme: { type: "apiKey" },
									rawAuthCredential: { apiKey: "k" },
								}),
							),
						],
					}),
					new LlmRequest(),
				),
			),
		).toEqual([]);
		warn.mockRestore();
	});
});

describe("auth-preprocessor leftover: store-catch arms", () => {
	it("catches when state setter throws for temp-prefixed key", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const state: Record<string, unknown> = {};
		Object.defineProperty(state, "temp:store-fail", {
			configurable: true,
			enumerable: true,
			get() {
				return undefined;
			},
			set() {
				throw new Error("cannot write");
			},
		});
		callStore(
			new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: { type: "apiKey" } as any,
					context: { credentialKey: "temp:store-fail" },
				}),
				credential: { apiKey: "x" } as any,
			}),
			baseCtx({ state }),
		);
		expect(warn).toHaveBeenCalledWith(
			"Failed to store auth response:",
			expect.any(Error),
		);
		warn.mockRestore();
	});

	it("catches when state setter throws for auto-prefixed credentialKey", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const state: Record<string, unknown> = {};
		Object.defineProperty(state, "temp:plain-key", {
			configurable: true,
			enumerable: true,
			get() {
				return undefined;
			},
			set() {
				throw new TypeError("frozen state");
			},
		});
		callStore(
			new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: { type: "oauth2" } as any,
					context: { credentialKey: "plain-key" },
				}),
				credential: { accessToken: "t" } as any,
			}),
			baseCtx({ state }),
		);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("catches when authConfig.context getter throws during key resolve", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const authConfig = new AuthConfig({
			authScheme: { type: "apiKey" } as any,
		});
		Object.defineProperty(authConfig, "context", {
			get() {
				throw new Error("context boom");
			},
		});
		callStore(
			new AuthHandler({
				authConfig,
				credential: { apiKey: "k" } as any,
			}),
			baseCtx({ state: {} }),
		);
		expect(warn).toHaveBeenCalledWith(
			"Failed to store auth response:",
			expect.any(Error),
		);
		warn.mockRestore();
	});

	it("oauth2 and openIdConnect store paths still hit catch on write failure", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		for (const type of ["oauth2", "openIdConnect"] as const) {
			const state: Record<string, unknown> = {};
			Object.defineProperty(state, "temp:oauth-fail", {
				configurable: true,
				enumerable: true,
				set() {
					throw new Error(`${type} write fail`);
				},
				get() {
					return undefined;
				},
			});
			callStore(
				new AuthHandler({
					authConfig: new AuthConfig({
						authScheme: { type } as any,
						context: { credentialKey: "temp:oauth-fail" },
					}),
					credential: { token: "t" } as any,
				}),
				baseCtx({ state }),
			);
		}
		expect(warn).toHaveBeenCalledTimes(2);
		warn.mockRestore();
	});
});

describe("auth-preprocessor leftover: resume loop single-hit paths", () => {
	it("yields once and returns on first matching original tool call", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const resumed = new Event({
			author: "auth-agent",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "tool-single",
							name: "secure_api",
							response: { ok: true },
						},
					},
				],
			},
		});
		handleFunctionCallsAsyncMock.mockResolvedValue(resumed);

		const earlierUnrelated = toolCall("other-tool", "other_api");
		const original = toolCall("tool-single");
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					agent: {
						name: "auth-agent",
						canonicalTools: async () => [{ name: "secure_api" }],
					},
					events: [
						earlierUnrelated,
						original,
						eucSystemCall(
							"euc-single",
							JSON.stringify({ function_call_id: "tool-single" }),
						),
						eucUserResponse(
							"euc-single",
							JSON.stringify({
								authScheme: { type: "apiKey" },
								rawAuthCredential: { apiKey: "k" },
							}),
						),
					],
				}),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([resumed]);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledTimes(1);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			original,
			{ secure_api: { name: "secure_api" } },
			new Set(["tool-single"]),
		);
		warn.mockRestore();
	});

	it("returns without yield when single-hit handleFunctionCallsAsync is null", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					events: [
						toolCall("tool-null"),
						eucSystemCall(
							"euc-null",
							JSON.stringify({ function_call_id: "tool-null" }),
						),
						eucUserResponse(
							"euc-null",
							JSON.stringify({
								authScheme: { type: "openIdConnect" },
								rawAuthCredential: {},
							}),
						),
					],
				}),
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});

	it("returns after toolsToResume is non-empty but no original call matches", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({
					events: [
						toolCall("wrong-id"),
						eucSystemCall(
							"euc-nomatch",
							JSON.stringify({ function_call_id: "expected-id" }),
						),
						eucUserResponse(
							"euc-nomatch",
							JSON.stringify({
								authScheme: { type: "apiKey" },
								rawAuthCredential: { apiKey: "k" },
							}),
						),
					],
				}),
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("single-hit path skips filler events without function calls before match", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(
			new Event({ author: "auth-agent" }),
		);
		const filler = new Event({
			author: "auth-agent",
			content: { role: "model", parts: [{ text: "thinking" }] },
		});
		const original = toolCall("tool-fill");
		await collect(
			requestProcessor.runAsync(
				baseCtx({
					agent: {
						name: "auth-agent",
						canonicalTools: async () => [{ name: "secure_api" }],
					},
					events: [
						original,
						filler,
						eucSystemCall(
							"euc-fill",
							JSON.stringify({ function_call_id: "tool-fill" }),
						),
						eucUserResponse(
							"euc-fill",
							JSON.stringify({
								authScheme: { type: "apiKey" },
								rawAuthCredential: { apiKey: "k" },
							}),
						),
					],
				}),
				new LlmRequest(),
			),
		);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			original,
			expect.anything(),
			new Set(["tool-fill"]),
		);
		warn.mockRestore();
	});
});
