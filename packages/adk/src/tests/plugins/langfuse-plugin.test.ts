import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";
import type { BaseTool } from "../../tools/base/base-tool";
import { ToolContext } from "../../tools/tool-context";

const {
	traceMock,
	eventMock,
	spanMock,
	generationMock,
	updateMock,
	endMock,
	flushAsync,
	shutdownAsync,
	LangfuseMock,
} = vi.hoisted(() => {
	const updateMock = vi.fn();
	const endMock = vi.fn();
	const eventMock = vi.fn();
	const spanMock = vi.fn(() => ({
		update: updateMock,
		end: endMock,
		event: eventMock,
		span: vi.fn(),
		generation: vi.fn(),
	}));
	const generationMock = vi.fn(() => ({
		update: updateMock,
		end: endMock,
	}));
	const traceMock = vi.fn(() => ({
		update: updateMock,
		event: eventMock,
		span: spanMock,
		generation: generationMock,
	}));
	const flushAsync = vi.fn().mockResolvedValue(undefined);
	const shutdownAsync = vi.fn().mockResolvedValue(undefined);
	const LangfuseMock = vi.fn(function Langfuse(this: any) {
		this.trace = traceMock;
		this.flushAsync = flushAsync;
		this.shutdownAsync = shutdownAsync;
	});
	return {
		traceMock,
		eventMock,
		spanMock,
		generationMock,
		updateMock,
		endMock,
		flushAsync,
		shutdownAsync,
		LangfuseMock,
	};
});

vi.mock("langfuse", () => ({
	Langfuse: LangfuseMock,
}));

import { LangfusePlugin } from "../../plugins/langfuse-plugin";

function makeInvocation(overrides: Record<string, unknown> = {}) {
	return {
		invocationId: "inv-1",
		userId: "user-1",
		appName: "app",
		branch: "main",
		userContent: { role: "user", parts: [{ text: "hello" }] },
		session: { id: "sess-1", state: {} },
		agent: {
			name: "root",
			constructor: { name: "LlmAgent" },
			parentAgent: undefined,
			subAgents: [],
			description: "root agent",
		},
		...overrides,
	} as any;
}

function makeCallbackContext(invocation = makeInvocation()) {
	return {
		invocationId: invocation.invocationId,
		agentName: invocation.agent.name,
		invocationContext: invocation,
	} as any;
}

function makeTool(name = "search"): BaseTool {
	return {
		name,
		description: "search",
		isLongRunning: false,
		shouldRetryOnFailure: false,
		maxRetryAttempts: 0,
		constructor: { name: "FunctionTool" },
	} as BaseTool;
}

describe("LangfusePlugin", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		spanMock.mockImplementation(() => ({
			update: updateMock,
			end: endMock,
			event: eventMock,
			span: spanMock,
			generation: generationMock,
		}));
		generationMock.mockImplementation(() => ({
			update: updateMock,
			end: endMock,
		}));
		traceMock.mockImplementation(() => ({
			update: updateMock,
			event: eventMock,
			span: spanMock,
			generation: generationMock,
		}));
	});

	it("applies defaults for name, baseUrl, and flush settings", () => {
		const plugin = new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
		});
		expect(plugin.name).toBe("langfuse_plugin");
		expect(LangfuseMock).toHaveBeenCalledWith(
			expect.objectContaining({
				publicKey: "pk",
				secretKey: "sk",
				baseUrl: "https://us.cloud.langfuse.com",
				flushAt: 1,
				flushInterval: 1000,
			}),
		);
	});

	it("creates a trace on user message and reuses it on later callbacks", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const invocation = makeInvocation();

		await plugin.onUserMessageCallback({
			invocationContext: invocation,
			userMessage: { role: "user", parts: [{ text: "hi" }] },
		});
		expect(traceMock).toHaveBeenCalledTimes(1);
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({ name: "user_message" }),
		);

		await plugin.beforeRunCallback({ invocationContext: invocation });
		expect(traceMock).toHaveBeenCalledTimes(1);
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({ name: "run_start" }),
		);
	});

	it("names onEventCallback for function calls, finals, and generic events", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const invocation = makeInvocation();

		const fcEvent = new Event({
			invocationId: "inv-1",
			author: "worker",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "search", args: {} } }],
			},
		});
		await plugin.onEventCallback({
			invocationContext: invocation,
			event: fcEvent,
		});
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({ name: "worker.function_call" }),
		);

		const finalEvent = new Event({
			invocationId: "inv-1",
			author: "worker",
			content: { role: "model", parts: [{ text: "done" }] },
			actions: { skipSummarization: true } as any,
		});
		await plugin.onEventCallback({
			invocationContext: invocation,
			event: finalEvent,
		});
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({ name: "worker.final_response" }),
		);

		const plain = new Event({
			invocationId: "inv-1",
			author: "worker",
			content: { role: "model", parts: [{ text: "partial" }] },
			partial: true,
		});
		await plugin.onEventCallback({
			invocationContext: invocation,
			event: plain,
		});
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({ name: "worker.event" }),
		);
	});

	it("afterRunCallback no-ops without a trace and uses last event output", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const invocation = makeInvocation({ invocationId: "missing" });
		await plugin.afterRunCallback({
			invocationContext: invocation,
			result: "ignored",
		});
		expect(updateMock).not.toHaveBeenCalled();

		const inv = makeInvocation();
		await plugin.onUserMessageCallback({
			invocationContext: inv,
			userMessage: { role: "user", parts: [{ text: "q" }] },
		});
		const last = new Event({
			invocationId: "inv-1",
			author: "root",
			content: { role: "model", parts: [{ text: "answer" }] },
		});
		await plugin.onEventCallback({ invocationContext: inv, event: last });
		await plugin.afterRunCallback({ invocationContext: inv });
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				output: "answer",
			}),
		);
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({ name: "run_complete" }),
		);
	});

	it("falls back to params.result when no last event exists", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation();
		await plugin.beforeRunCallback({ invocationContext: inv });
		await plugin.afterRunCallback({
			invocationContext: inv,
			result: { content: { role: "model", parts: [{ text: "from-result" }] } },
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({ output: "from-result" }),
		);
	});

	it("tracks agent spans, model generations, and tool spans", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation();
		const callbackContext = makeCallbackContext(inv);
		const agent = inv.agent;

		await plugin.beforeAgentCallback({ agent, callbackContext });
		expect(spanMock).toHaveBeenCalledWith(
			expect.objectContaining({ name: "root" }),
		);

		const llmRequest = new LlmRequest({
			model: "gemini-2.5-flash",
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
			config: { temperature: 0.1, systemInstruction: "be brief" },
			toolsDict: { search: makeTool() },
		});
		await plugin.beforeModelCallback({ callbackContext, llmRequest });
		expect(generationMock).toHaveBeenCalled();

		await plugin.afterModelCallback({
			callbackContext,
			llmRequest,
			llmResponse: new LlmResponse({
				content: { role: "model", parts: [{ text: "ok" }] },
				text: "ok",
				usageMetadata: {
					promptTokenCount: 2,
					candidatesTokenCount: 3,
					totalTokenCount: 5,
				},
			}),
		});
		expect(endMock).toHaveBeenCalled();

		const toolContext = new ToolContext(inv, { functionCallId: "fc-1" });

		await plugin.beforeToolCallback({
			tool: makeTool(),
			toolArgs: { q: "paris" },
			toolContext,
		});
		await plugin.afterToolCallback({
			tool: makeTool(),
			toolArgs: { q: "paris" },
			toolContext,
			result: { ok: true },
		});

		await plugin.beforeModelCallback({ callbackContext, llmRequest });
		await plugin.onModelErrorCallback({
			callbackContext,
			llmRequest,
			error: new Error("model down"),
		});

		const failingToolContext = new ToolContext(inv, {
			functionCallId: "fc-2",
		});
		await plugin.beforeToolCallback({
			tool: makeTool("failing"),
			toolArgs: {},
			toolContext: failingToolContext,
		});
		await plugin.onToolErrorCallback({
			tool: makeTool("failing"),
			toolArgs: {},
			toolContext: failingToolContext,
			error: "tool boom",
		});

		await plugin.afterAgentCallback({ agent, callbackContext });
		await plugin.flush();
		await plugin.close();
		expect(flushAsync).toHaveBeenCalled();
		expect(shutdownAsync).toHaveBeenCalled();
	});

	it("serializes rich content parts via toPlainText through callbacks", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({
			userContent: {
				role: "user",
				parts: [
					{ text: "ask" },
					{ functionCall: { name: "lookup" } },
					{ functionResponse: { name: "lookup" } },
					{ executableCode: { language: "PYTHON" } },
					{ codeExecutionResult: { outcome: "OK" } },
					{ thought: true },
				],
			},
		});
		await plugin.onUserMessageCallback({
			invocationContext: inv,
			userMessage: inv.userContent,
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				input: expect.stringContaining("[Function Call: lookup]"),
			}),
		);

		const circular: any = { a: 1 };
		circular.self = circular;
		await plugin.afterRunCallback({
			invocationContext: inv,
			result: circular,
		});
		expect(updateMock).toHaveBeenCalled();
	});

	it("beforeModelCallback returns undefined without an agent span", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const result = await plugin.beforeModelCallback({
			callbackContext: makeCallbackContext(),
			llmRequest: new LlmRequest({ model: "gemini-2.5-flash" }),
		});
		expect(result).toBeUndefined();
		expect(generationMock).not.toHaveBeenCalled();
	});

	it("nests child agent spans under the parent agent span", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const rootAgent = {
			name: "root",
			constructor: { name: "LlmAgent" },
			parentAgent: undefined,
			subAgents: [{ name: "worker" }],
			description: "root agent",
		};
		const workerAgent = {
			name: "worker",
			constructor: { name: "LlmAgent" },
			parentAgent: rootAgent,
			subAgents: [],
			description: "worker agent",
		};
		const inv = makeInvocation({ agent: rootAgent });
		const rootCtx = makeCallbackContext(inv);
		const workerCtx = {
			...makeCallbackContext(inv),
			agentName: "worker",
		};

		await plugin.beforeAgentCallback({
			agent: rootAgent as any,
			callbackContext: rootCtx,
		});
		expect(spanMock).toHaveBeenCalledWith(
			expect.objectContaining({ name: "root" }),
		);

		const rootSpan = spanMock.mock.results[0]?.value;
		await plugin.beforeAgentCallback({
			agent: workerAgent as any,
			callbackContext: workerCtx,
		});
		expect(rootSpan.span).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "worker",
				metadata: expect.objectContaining({ parentAgent: "root" }),
			}),
		);

		await plugin.afterAgentCallback({
			agent: workerAgent as any,
			callbackContext: workerCtx,
			result: { content: { role: "model", parts: [{ text: "child-done" }] } },
		});
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({ name: "worker_completed" }),
		);
	});

	it("serializes fileData and inlineData through onEventCallback metadata", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation();
		await plugin.beforeRunCallback({ invocationContext: inv });
		eventMock.mockClear();

		const event = new Event({
			invocationId: "inv-1",
			author: "root",
			partial: true,
			content: {
				role: "user",
				parts: [
					{
						fileData: {
							mimeType: "image/png",
							fileUri: "gs://bucket/a.png",
						},
					},
					{
						inlineData: {
							mimeType: "text/plain",
							data: "YQ==",
						},
					},
				],
			},
		});

		await plugin.onEventCallback({ invocationContext: inv, event });
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "root.event",
				input: expect.objectContaining({
					parts: expect.arrayContaining([
						expect.objectContaining({
							fileData: {
								mimeType: "image/png",
								fileUri: "gs://bucket/a.png",
							},
						}),
						expect.objectContaining({
							inlineData: { mimeType: "text/plain", dataSize: 4 },
						}),
					]),
				}),
			}),
		);
	});

	it("afterModelCallback maps usage metadata onto the generation end", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation();
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

		const llmRequest = new LlmRequest({ model: "gemini-2.5-flash" });
		await plugin.beforeModelCallback({ callbackContext, llmRequest });
		await plugin.afterModelCallback({
			callbackContext,
			llmRequest,
			llmResponse: new LlmResponse({
				content: { role: "model", parts: [{ text: "ok" }] },
				usageMetadata: {
					promptTokenCount: 11,
					candidatesTokenCount: 7,
					totalTokenCount: 18,
				},
			}),
		});

		expect(endMock).toHaveBeenCalled();
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				usage: expect.objectContaining({
					input: 11,
					output: 7,
					total: 18,
				}),
			}),
		);
	});

	describe("constructor options", () => {
		it("forwards custom name, baseUrl, release, and flush settings", () => {
			const plugin = new LangfusePlugin({
				name: "custom_langfuse",
				publicKey: "pk-custom",
				secretKey: "sk-custom",
				baseUrl: "https://eu.cloud.langfuse.com",
				release: "1.2.3",
				flushAt: 42,
				flushInterval: 5000,
			});

			expect(plugin.name).toBe("custom_langfuse");
			expect(LangfuseMock).toHaveBeenCalledWith({
				publicKey: "pk-custom",
				secretKey: "sk-custom",
				baseUrl: "https://eu.cloud.langfuse.com",
				release: "1.2.3",
				flushAt: 42,
				flushInterval: 5000,
			});
		});
	});

	describe("toPlainText via callbacks", () => {
		it("stringifies numbers and booleans in result fallbacks", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			await plugin.beforeRunCallback({ invocationContext: inv });
			updateMock.mockClear();

			await plugin.afterRunCallback({
				invocationContext: inv,
				result: 42,
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({ output: "42" }),
			);

			const inv2 = makeInvocation({ invocationId: "inv-bool" });
			await plugin.beforeRunCallback({ invocationContext: inv2 });
			updateMock.mockClear();
			await plugin.afterRunCallback({
				invocationContext: inv2,
				result: false,
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({ output: "false" }),
			);
		});

		it("joins arrays of Content with blank lines and unwraps nested content", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			await plugin.beforeRunCallback({ invocationContext: inv });
			updateMock.mockClear();

			await plugin.afterRunCallback({
				invocationContext: inv,
				result: [
					{ role: "user", parts: [{ text: "one" }] },
					{ role: "model", parts: [{ text: "two" }] },
				],
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({ output: "one\n\ntwo" }),
			);

			const inv2 = makeInvocation({ invocationId: "inv-nested" });
			await plugin.beforeRunCallback({ invocationContext: inv2 });
			updateMock.mockClear();
			await plugin.afterRunCallback({
				invocationContext: inv2,
				result: {
					content: { role: "model", parts: [{ text: "nested-out" }] },
				},
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({ output: "nested-out" }),
			);
		});

		it("filters empty parts and stringifies plain objects", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation({
				userContent: {
					role: "user",
					parts: [{}, { text: "kept" }, { text: "" }],
				},
			});
			await plugin.onUserMessageCallback({
				invocationContext: inv,
				userMessage: inv.userContent,
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({ input: "kept" }),
			);

			const inv2 = makeInvocation({ invocationId: "inv-obj" });
			await plugin.beforeRunCallback({ invocationContext: inv2 });
			updateMock.mockClear();
			await plugin.afterRunCallback({
				invocationContext: inv2,
				result: { foo: "bar", n: 1 },
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					output: expect.stringContaining('"foo": "bar"'),
				}),
			);
		});

		it("skips run_complete when result is undefined and no last event exists", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			await plugin.beforeRunCallback({ invocationContext: inv });
			eventMock.mockClear();
			updateMock.mockClear();

			await plugin.afterRunCallback({
				invocationContext: inv,
				result: undefined,
			});
			expect(eventMock).not.toHaveBeenCalledWith(
				expect.objectContaining({ name: "run_complete" }),
			);
		});

		it("throws when afterRun receives null result without a last event", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			await plugin.beforeRunCallback({ invocationContext: inv });

			await expect(
				plugin.afterRunCallback({
					invocationContext: inv,
					result: null,
				}),
			).rejects.toThrow();
		});
	});

	describe("serialize helpers via model and event callbacks", () => {
		it("passes null generation input for empty or missing contents", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

			await plugin.beforeModelCallback({
				callbackContext,
				llmRequest: new LlmRequest({
					model: "gemini-2.5-flash",
					contents: [],
				}),
			});
			expect(generationMock).toHaveBeenCalledWith(
				expect.objectContaining({
					input: null,
					metadata: expect.objectContaining({
						hasTools: false,
						toolCount: 0,
						contentCount: 0,
						modelConfig: undefined,
					}),
				}),
			);

			generationMock.mockClear();
			await plugin.beforeModelCallback({
				callbackContext,
				llmRequest: new LlmRequest({ model: undefined as any }),
			});
			expect(generationMock).toHaveBeenCalledWith(
				expect.objectContaining({
					model: undefined,
					input: null,
				}),
			);
		});

		it("serializes functionCall, functionResponse, code, and result parts", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			await plugin.beforeRunCallback({ invocationContext: inv });
			eventMock.mockClear();

			const event = new Event({
				invocationId: "inv-1",
				author: "root",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								name: "search",
								args: { q: "x" },
								id: "fc-9",
							},
						},
						{
							functionResponse: {
								name: "search",
								response: { ok: true },
								id: "fc-9",
							},
						},
						{
							executableCode: {
								language: "PYTHON",
								code: "print(1)",
							},
						},
						{
							codeExecutionResult: {
								outcome: "OK",
								output: "1",
							},
						},
						{
							inlineData: { mimeType: "application/octet-stream" },
						},
						{ thought: true },
					],
				},
			});

			await plugin.onEventCallback({ invocationContext: inv, event });
			expect(eventMock).toHaveBeenCalledWith(
				expect.objectContaining({
					input: {
						role: "model",
						parts: [
							{
								functionCall: {
									name: "search",
									args: { q: "x" },
									id: "fc-9",
								},
							},
							{
								functionResponse: {
									name: "search",
									response: { ok: true },
									id: "fc-9",
								},
							},
							{
								executableCode: {
									language: "PYTHON",
									code: "print(1)",
								},
							},
							{
								codeExecutionResult: {
									outcome: "OK",
									output: "1",
								},
							},
							{
								inlineData: {
									mimeType: "application/octet-stream",
									dataSize: 0,
								},
							},
							{ thought: true },
						],
					},
				}),
			);
		});

		it("truncates textPreview to 200 characters on user_message", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const longText = "a".repeat(250);
			const inv = makeInvocation();
			eventMock.mockClear();

			await plugin.onUserMessageCallback({
				invocationContext: inv,
				userMessage: { role: "user", parts: [{ text: longText }] },
			});

			expect(eventMock).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "user_message",
					metadata: expect.objectContaining({
						textPreview: "a".repeat(200),
					}),
				}),
			);
		});
	});

	describe("onEventCallback last-event and parent span", () => {
		it("does not store function-call-only events as last event output", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			await plugin.beforeRunCallback({ invocationContext: inv });

			await plugin.onEventCallback({
				invocationContext: inv,
				event: new Event({
					invocationId: "inv-1",
					author: "root",
					content: {
						role: "model",
						parts: [{ functionCall: { name: "search", args: {} } }],
					},
				}),
			});

			updateMock.mockClear();
			eventMock.mockClear();
			await plugin.afterRunCallback({
				invocationContext: inv,
				result: "fallback-result",
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({ output: "fallback-result" }),
			);
		});

		it("stores codeExecutionResult events as last event output", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			await plugin.beforeRunCallback({ invocationContext: inv });

			await plugin.onEventCallback({
				invocationContext: inv,
				event: new Event({
					invocationId: "inv-1",
					author: "root",
					content: {
						role: "model",
						parts: [
							{
								codeExecutionResult: {
									outcome: "OK",
									output: "42",
								},
							},
						],
					},
				}),
			});

			updateMock.mockClear();
			await plugin.afterRunCallback({
				invocationContext: inv,
				result: "should-not-win",
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					output: "[Code Result: OK]",
					metadata: expect.objectContaining({ resultType: "event" }),
				}),
			);
		});

		it("logs events on the agent span when one exists for the author", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

			const agentSpan = spanMock.mock.results[0]?.value;
			eventMock.mockClear();

			const event = new Event({
				invocationId: "inv-1",
				author: "root",
				partial: true,
				branch: "main",
				content: {
					role: "model",
					parts: [
						{ text: "partial" },
						{
							functionResponse: {
								name: "search",
								response: { ok: true },
							},
						},
					],
				},
			});
			event.finishReason = "STOP";

			await plugin.onEventCallback({ invocationContext: inv, event });
			expect(agentSpan.event).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "root.event",
					metadata: expect.objectContaining({
						partial: true,
						branch: "main",
						hasFunctionResponses: true,
						hasFunctionCalls: false,
						isFinalResponse: false,
						finishReason: "STOP",
						textPreview: expect.stringContaining("partial"),
					}),
				}),
			);
		});
	});

	describe("afterRunCallback fallbacks and cleanup", () => {
		it("prefers last event over params.result when both exist", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			await plugin.beforeRunCallback({ invocationContext: inv });
			await plugin.onEventCallback({
				invocationContext: inv,
				event: new Event({
					invocationId: "inv-1",
					author: "root",
					content: { role: "model", parts: [{ text: "from-event" }] },
				}),
			});
			updateMock.mockClear();

			await plugin.afterRunCallback({
				invocationContext: inv,
				result: {
					content: { role: "model", parts: [{ text: "from-result" }] },
				},
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({ output: "from-event" }),
			);
		});

		it("serializes Event instance results when no last event exists", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			await plugin.beforeRunCallback({ invocationContext: inv });
			updateMock.mockClear();

			const resultEvent = new Event({
				invocationId: "inv-1",
				author: "root",
				content: { role: "model", parts: [{ text: "event-instance" }] },
			});
			await plugin.afterRunCallback({
				invocationContext: inv,
				result: resultEvent,
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({ output: "event-instance" }),
			);
		});

		it("aggregates token usage across model rounds and clears per-invocation state", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

			const llmRequest = new LlmRequest({ model: "gemini-2.5-flash" });
			await plugin.beforeModelCallback({ callbackContext, llmRequest });
			await plugin.afterModelCallback({
				callbackContext,
				llmRequest,
				llmResponse: new LlmResponse({
					content: { role: "model", parts: [{ text: "a" }] },
					usageMetadata: {
						promptTokenCount: 10,
						candidatesTokenCount: 5,
						totalTokenCount: 15,
					},
				}),
			});

			await plugin.beforeModelCallback({ callbackContext, llmRequest });
			await plugin.afterModelCallback({
				callbackContext,
				llmRequest,
				llmResponse: new LlmResponse({
					content: { role: "model", parts: [{ text: "b" }] },
					usageMetadata: {
						promptTokenCount: 3,
						candidatesTokenCount: 2,
						totalTokenCount: 5,
					},
				}),
			});

			updateMock.mockClear();
			await plugin.afterRunCallback({ invocationContext: inv });
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						usage: { input: 13, output: 7, total: 20 },
						totalInputTokens: 13,
						totalOutputTokens: 7,
						totalTokens: 20,
					}),
				}),
			);

			updateMock.mockClear();
			eventMock.mockClear();
			await plugin.afterRunCallback({
				invocationContext: inv,
				result: "second-pass",
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({ output: "second-pass" }),
			);
			expect(updateMock).not.toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({ totalTokens: 20 }),
				}),
			);
		});

		it("clears modelsUsed for one invocation without affecting another", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const invA = makeInvocation({ invocationId: "inv-a" });
			const invB = makeInvocation({ invocationId: "inv-b" });
			const ctxA = makeCallbackContext(invA);
			const ctxB = makeCallbackContext(invB);

			await plugin.beforeAgentCallback({
				agent: invA.agent,
				callbackContext: ctxA,
			});
			await plugin.beforeAgentCallback({
				agent: invB.agent,
				callbackContext: ctxB,
			});

			const req = new LlmRequest({ model: "model-a" });
			await plugin.beforeModelCallback({
				callbackContext: ctxA,
				llmRequest: req,
			});
			await plugin.afterModelCallback({
				callbackContext: ctxA,
				llmRequest: req,
				llmResponse: new LlmResponse({
					content: { role: "model", parts: [{ text: "a" }] },
				}),
			});

			const reqB = new LlmRequest({ model: "model-b" });
			await plugin.beforeModelCallback({
				callbackContext: ctxB,
				llmRequest: reqB,
			});
			await plugin.afterModelCallback({
				callbackContext: ctxB,
				llmRequest: reqB,
				llmResponse: new LlmResponse({
					content: { role: "model", parts: [{ text: "b" }] },
				}),
			});

			await plugin.afterRunCallback({ invocationContext: invA });

			updateMock.mockClear();
			await plugin.afterAgentCallback({
				agent: invB.agent,
				callbackContext: ctxB,
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						modelsUsed: ["model-b"],
					}),
				}),
			);
		});
	});

	describe("agent span edge cases", () => {
		it("afterAgentCallback no-ops without a prior agent span", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const result = await plugin.afterAgentCallback({
				agent: inv.agent,
				callbackContext: makeCallbackContext(inv),
				result: { content: { role: "model", parts: [{ text: "x" }] } },
			});
			expect(result).toBeUndefined();
			expect(endMock).not.toHaveBeenCalled();
		});

		it("uses null input when invocation has no userContent", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation({ userContent: undefined });
			await plugin.beforeAgentCallback({
				agent: inv.agent,
				callbackContext: makeCallbackContext(inv),
			});
			expect(spanMock).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "root",
					input: null,
					metadata: expect.objectContaining({ inputText: "" }),
				}),
			);
		});

		it("skips parent completion event when parent span is already gone", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const rootAgent = {
				name: "root",
				constructor: { name: "LlmAgent" },
				parentAgent: undefined,
				subAgents: [{ name: "worker" }],
				description: "root",
			};
			const workerAgent = {
				name: "worker",
				constructor: { name: "LlmAgent" },
				parentAgent: rootAgent,
				subAgents: [],
				description: "worker",
			};
			const inv = makeInvocation({ agent: rootAgent });
			const rootCtx = makeCallbackContext(inv);
			const workerCtx = {
				...makeCallbackContext(inv),
				agentName: "worker",
			};

			await plugin.beforeAgentCallback({
				agent: rootAgent as any,
				callbackContext: rootCtx,
			});
			await plugin.beforeAgentCallback({
				agent: workerAgent as any,
				callbackContext: workerCtx,
			});
			await plugin.afterAgentCallback({
				agent: rootAgent as any,
				callbackContext: rootCtx,
			});
			eventMock.mockClear();

			await expect(
				plugin.afterAgentCallback({
					agent: workerAgent as any,
					callbackContext: workerCtx,
					result: "raw-result",
				}),
			).resolves.toBeUndefined();
			expect(eventMock).not.toHaveBeenCalledWith(
				expect.objectContaining({ name: "worker_completed" }),
			);
		});

		it("includes modelsUsed on afterAgent after a successful model call", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

			const llmRequest = new LlmRequest({ model: "gemini-2.5-flash" });
			await plugin.beforeModelCallback({ callbackContext, llmRequest });
			await plugin.afterModelCallback({
				callbackContext,
				llmRequest,
				llmResponse: new LlmResponse({
					content: { role: "model", parts: [{ text: "ok" }] },
				}),
			});

			updateMock.mockClear();
			await plugin.afterAgentCallback({ agent: inv.agent, callbackContext });
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						modelsUsed: ["gemini-2.5-flash"],
					}),
				}),
			);
		});

		it("uses raw result when afterAgent has no last event and result lacks content", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
			updateMock.mockClear();

			await plugin.afterAgentCallback({
				agent: inv.agent,
				callbackContext,
				result: "plain-agent-result",
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					output: "plain-agent-result",
					metadata: expect.objectContaining({
						outputText: "plain-agent-result",
					}),
				}),
			);
		});
	});

	describe("model generation edge cases", () => {
		it("includes systemInstruction and modelConfig when present", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

			const llmRequest = new LlmRequest({
				model: "gemini-2.5-flash",
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: {
					temperature: 0.4,
					maxOutputTokens: 128,
					topK: 8,
					topP: 0.9,
					systemInstruction: "be concise",
				},
				toolsDict: { search: makeTool(), lookup: makeTool("lookup") },
			});

			await plugin.beforeModelCallback({ callbackContext, llmRequest });
			expect(generationMock).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						systemInstruction: "be concise",
						hasTools: true,
						toolCount: 2,
						toolNames: expect.arrayContaining(["search", "lookup"]),
						modelConfig: {
							temperature: 0.4,
							maxOutputTokens: 128,
							topK: 8,
							topP: 0.9,
						},
						contentCount: 1,
					}),
				}),
			);
		});

		it("afterModelCallback no-ops without a generation", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
			updateMock.mockClear();
			endMock.mockClear();

			const result = await plugin.afterModelCallback({
				callbackContext,
				llmRequest: new LlmRequest({ model: "gemini-2.5-flash" }),
				llmResponse: new LlmResponse({
					content: { role: "model", parts: [{ text: "orphan" }] },
				}),
			});
			expect(result).toBeUndefined();
			expect(endMock).not.toHaveBeenCalled();
		});

		it("falls back to toPlainText when llmResponse.text is missing", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

			const llmRequest = new LlmRequest({ model: "gemini-2.5-flash" });
			await plugin.beforeModelCallback({ callbackContext, llmRequest });
			updateMock.mockClear();
			eventMock.mockClear();

			await plugin.afterModelCallback({
				callbackContext,
				llmRequest,
				llmResponse: new LlmResponse({
					content: { role: "model", parts: [{ text: "from-content" }] },
				}),
			});

			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						outputText: "from-content",
						textPreview: "from-content",
					}),
				}),
			);
			expect(eventMock).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "llm_response",
					metadata: expect.objectContaining({
						outputPreview: "from-content",
						model: "gemini-2.5-flash",
					}),
				}),
			);
		});

		it("skips token accumulation when usageMetadata is absent", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

			const llmRequest = new LlmRequest({ model: "gemini-2.5-flash" });
			await plugin.beforeModelCallback({ callbackContext, llmRequest });
			await plugin.afterModelCallback({
				callbackContext,
				llmRequest,
				llmResponse: new LlmResponse({
					content: { role: "model", parts: [{ text: "no-usage" }] },
					text: "no-usage",
				}),
			});

			updateMock.mockClear();
			await plugin.onEventCallback({
				invocationContext: inv,
				event: new Event({
					invocationId: "inv-1",
					author: "root",
					content: { role: "model", parts: [{ text: "done" }] },
				}),
			});
			await plugin.afterRunCallback({ invocationContext: inv });

			const usageUpdates = updateMock.mock.calls.filter(
				(call) => call[0]?.metadata?.totalTokens !== undefined,
			);
			expect(usageUpdates).toHaveLength(0);
		});

		it("uses unknown generation key when model is omitted on both sides", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

			await plugin.beforeModelCallback({
				callbackContext,
				llmRequest: new LlmRequest({}),
			});
			endMock.mockClear();
			await plugin.afterModelCallback({
				callbackContext,
				llmResponse: new LlmResponse({
					content: { role: "model", parts: [{ text: "ok" }] },
				}),
			});
			expect(endMock).toHaveBeenCalled();
		});
	});

	describe("model and tool error paths", () => {
		it("onModelErrorCallback handles Error and non-Error values", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

			const llmRequest = new LlmRequest({ model: "gemini-2.5-flash" });
			await plugin.beforeModelCallback({ callbackContext, llmRequest });
			updateMock.mockClear();
			eventMock.mockClear();

			const err = new Error("boom");
			err.name = "ModelError";
			await plugin.onModelErrorCallback({
				callbackContext,
				llmRequest,
				error: err,
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					level: "ERROR",
					statusMessage: "boom",
					metadata: expect.objectContaining({
						errorName: "ModelError",
						errorMessage: "boom",
						errorStack: expect.any(String),
						model: "gemini-2.5-flash",
					}),
				}),
			);
			expect(eventMock).toHaveBeenCalledWith(
				expect.objectContaining({ name: "llm_error" }),
			);

			await plugin.beforeModelCallback({ callbackContext, llmRequest });
			updateMock.mockClear();
			eventMock.mockClear();
			await plugin.onModelErrorCallback({
				callbackContext,
				llmRequest,
				error: "string-fail",
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					level: "ERROR",
					statusMessage: "string-fail",
					metadata: expect.objectContaining({
						errorName: "Error",
						errorMessage: "string-fail",
						errorStack: undefined,
					}),
				}),
			);
		});

		it("onModelErrorCallback still logs llm_error on agent span without generation", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
			eventMock.mockClear();
			updateMock.mockClear();

			await plugin.onModelErrorCallback({
				callbackContext,
				llmRequest: new LlmRequest({ model: "gemini-2.5-flash" }),
				error: new Error("no-gen"),
			});
			expect(eventMock).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "llm_error",
					metadata: expect.objectContaining({ errorMessage: "no-gen" }),
				}),
			);
			expect(updateMock).not.toHaveBeenCalledWith(
				expect.objectContaining({ level: "ERROR" }),
			);
		});

		it("beforeToolCallback no-ops without an agent span", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const result = await plugin.beforeToolCallback({
				tool: makeTool(),
				toolArgs: { q: "x" },
				toolContext: new ToolContext(inv, { functionCallId: "fc-x" }),
			});
			expect(result).toBeUndefined();
			expect(spanMock).not.toHaveBeenCalled();
		});

		it("uses unknown tool key when functionCallId is missing", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

			const agentSpan = spanMock.mock.results[0]?.value;
			await plugin.beforeToolCallback({
				tool: makeTool("orphan"),
				toolArgs: { a: 1 },
				toolContext: new ToolContext(inv),
			});
			expect(agentSpan.span).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "orphan",
					metadata: expect.objectContaining({
						functionCallId: undefined,
						argsPreview: expect.stringContaining('"a"'),
					}),
				}),
			);

			updateMock.mockClear();
			await plugin.afterToolCallback({
				tool: makeTool("orphan"),
				toolArgs: { a: 1 },
				toolContext: new ToolContext(inv),
				result: { ok: true },
			});
			expect(updateMock).toHaveBeenCalled();
			expect(endMock).toHaveBeenCalled();
		});

		it("afterToolCallback no-ops without a prior tool span", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const result = await plugin.afterToolCallback({
				tool: makeTool(),
				toolArgs: {},
				toolContext: new ToolContext(inv, { functionCallId: "missing" }),
				result: { ok: true },
			});
			expect(result).toBeUndefined();
			expect(endMock).not.toHaveBeenCalled();
		});

		it("afterToolCallback ends tool span even if agent span is gone", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

			const toolContext = new ToolContext(inv, { functionCallId: "fc-gone" });
			await plugin.beforeToolCallback({
				tool: makeTool(),
				toolArgs: {},
				toolContext,
			});
			await plugin.afterAgentCallback({ agent: inv.agent, callbackContext });
			eventMock.mockClear();
			endMock.mockClear();

			await plugin.afterToolCallback({
				tool: makeTool(),
				toolArgs: {},
				toolContext,
				result: { done: true },
			});
			expect(endMock).toHaveBeenCalled();
			expect(eventMock).not.toHaveBeenCalledWith(
				expect.objectContaining({ name: "search_completed" }),
			);
		});

		it("onToolErrorCallback handles Error values and missing tool spans", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			const callbackContext = makeCallbackContext(inv);
			await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

			const toolContext = new ToolContext(inv, { functionCallId: "fc-err" });
			await plugin.beforeToolCallback({
				tool: makeTool("broken"),
				toolArgs: { x: 1 },
				toolContext,
			});
			updateMock.mockClear();
			eventMock.mockClear();

			const err = new Error("tool failed");
			err.name = "ToolError";
			await plugin.onToolErrorCallback({
				tool: makeTool("broken"),
				toolArgs: { x: 1 },
				toolContext,
				error: err,
			});
			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					level: "ERROR",
					statusMessage: "tool failed",
					metadata: expect.objectContaining({
						errorName: "ToolError",
						errorMessage: "tool failed",
						errorStack: expect.any(String),
						toolArgs: { x: 1 },
					}),
				}),
			);
			expect(eventMock).toHaveBeenCalledWith(
				expect.objectContaining({ name: "broken_error" }),
			);

			eventMock.mockClear();
			updateMock.mockClear();
			await plugin.onToolErrorCallback({
				tool: makeTool("ghost"),
				toolArgs: {},
				toolContext: new ToolContext(inv, { functionCallId: "no-span" }),
				error: "ghost-fail",
			});
			expect(eventMock).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "ghost_error",
					metadata: expect.objectContaining({
						errorMessage: "ghost-fail",
						errorStack: undefined,
					}),
				}),
			);
			expect(updateMock).not.toHaveBeenCalledWith(
				expect.objectContaining({ level: "ERROR" }),
			);
		});
	});

	describe("trace isolation", () => {
		it("creates separate traces for distinct invocationIds", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv1 = makeInvocation({ invocationId: "inv-1" });
			const inv2 = makeInvocation({ invocationId: "inv-2" });

			await plugin.beforeRunCallback({ invocationContext: inv1 });
			await plugin.beforeRunCallback({ invocationContext: inv2 });

			expect(traceMock).toHaveBeenCalledTimes(2);
			expect(traceMock).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({ id: "inv-1" }),
			);
			expect(traceMock).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({ id: "inv-2" }),
			);
		});

		it("emits run_start metadata with agentName and sessionId", async () => {
			const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
			const inv = makeInvocation();
			eventMock.mockClear();

			await plugin.beforeRunCallback({ invocationContext: inv });
			expect(eventMock).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "run_start",
					metadata: expect.objectContaining({
						agentName: "root",
						sessionId: "sess-1",
						timestamp: expect.any(Number),
					}),
				}),
			);
		});
	});
});
