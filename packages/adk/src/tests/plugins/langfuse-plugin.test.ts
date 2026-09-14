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

	it("passes custom name, baseUrl, release, and flush options to Langfuse", () => {
		const plugin = new LangfusePlugin({
			name: "custom_langfuse",
			publicKey: "pk-custom",
			secretKey: "sk-custom",
			baseUrl: "https://eu.cloud.langfuse.com",
			release: "1.2.3",
			flushAt: 25,
			flushInterval: 5000,
		});

		expect(plugin.name).toBe("custom_langfuse");
		expect(LangfuseMock).toHaveBeenCalledWith({
			publicKey: "pk-custom",
			secretKey: "sk-custom",
			baseUrl: "https://eu.cloud.langfuse.com",
			release: "1.2.3",
			flushAt: 25,
			flushInterval: 5000,
		});
	});

	it("toPlainText coerces null, undefined, numbers, and booleans via user message", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });

		await plugin.onUserMessageCallback({
			invocationContext: makeInvocation({
				userContent: null,
				invocationId: "inv-null",
			}),
			userMessage: null as any,
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({ input: "" }),
		);

		updateMock.mockClear();
		await plugin.onUserMessageCallback({
			invocationContext: makeInvocation({
				userContent: undefined,
				invocationId: "inv-undef",
			}),
			userMessage: undefined as any,
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({ input: "" }),
		);

		updateMock.mockClear();
		await plugin.afterRunCallback({
			invocationContext: makeInvocation({ invocationId: "inv-num" }),
			result: 42,
		});
		await plugin.beforeRunCallback({
			invocationContext: makeInvocation({ invocationId: "inv-num" }),
		});
		await plugin.afterRunCallback({
			invocationContext: makeInvocation({ invocationId: "inv-num" }),
			result: 42,
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({ output: "42" }),
		);

		updateMock.mockClear();
		const invBool = makeInvocation({ invocationId: "inv-bool" });
		await plugin.beforeRunCallback({ invocationContext: invBool });
		await plugin.afterRunCallback({
			invocationContext: invBool,
			result: true,
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({ output: "true" }),
		);
	});

	it("toPlainText joins Content arrays and unwraps nested content wrappers", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-array" });
		await plugin.beforeRunCallback({ invocationContext: inv });
		updateMock.mockClear();

		await plugin.afterRunCallback({
			invocationContext: inv,
			result: [
				{ role: "user", parts: [{ text: "first" }] },
				{ role: "model", parts: [{ text: "second" }] },
			],
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({ output: "first\n\nsecond" }),
		);

		const invNested = makeInvocation({ invocationId: "inv-nested" });
		await plugin.beforeRunCallback({ invocationContext: invNested });
		updateMock.mockClear();
		await plugin.afterRunCallback({
			invocationContext: invNested,
			result: {
				content: { role: "model", parts: [{ text: "unwrapped" }] },
			},
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({ output: "unwrapped" }),
		);
	});

	it("serializePart retains functionCall/functionResponse ids and code fields", async () => {
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
							args: { q: "adk" },
							id: "fc-99",
						},
					},
					{
						functionResponse: {
							name: "search",
							response: { hits: 1 },
							id: "fr-99",
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
					{ thought: true },
				],
			},
		});

		await plugin.onEventCallback({ invocationContext: inv, event });
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({
					parts: expect.arrayContaining([
						expect.objectContaining({
							functionCall: {
								name: "search",
								args: { q: "adk" },
								id: "fc-99",
							},
						}),
						expect.objectContaining({
							functionResponse: {
								name: "search",
								response: { hits: 1 },
								id: "fr-99",
							},
						}),
						expect.objectContaining({
							executableCode: {
								language: "PYTHON",
								code: "print(1)",
							},
						}),
						expect.objectContaining({
							codeExecutionResult: {
								outcome: "OK",
								output: "1",
							},
						}),
						expect.objectContaining({ thought: true }),
					]),
				}),
			}),
		);
	});

	it("serializeContents returns null for missing/empty contents in beforeModelCallback", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation();
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
		generationMock.mockClear();

		await plugin.beforeModelCallback({
			callbackContext,
			llmRequest: new LlmRequest({
				model: "gemini-2.5-flash",
				contents: undefined,
			}),
		});
		expect(generationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				input: null,
				metadata: expect.objectContaining({ contentCount: 0 }),
			}),
		);

		generationMock.mockClear();
		await plugin.beforeModelCallback({
			callbackContext,
			llmRequest: new LlmRequest({
				model: "gemini-2.5-flash",
				contents: [],
			}),
		});
		expect(generationMock).toHaveBeenCalledWith(
			expect.objectContaining({ input: null }),
		);
	});

	it("onEventCallback prefers the agent span when one exists for the author", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation();
		const callbackContext = makeCallbackContext(inv);

		const agentEventSpy = vi.fn();
		spanMock.mockImplementationOnce(() => ({
			update: updateMock,
			end: endMock,
			event: agentEventSpy,
			span: spanMock,
			generation: generationMock,
		}));

		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
		eventMock.mockClear();

		const event = new Event({
			invocationId: "inv-1",
			author: "root",
			content: { role: "model", parts: [{ text: "via-agent-span" }] },
			partial: true,
		});
		await plugin.onEventCallback({ invocationContext: inv, event });

		expect(agentEventSpy).toHaveBeenCalledWith(
			expect.objectContaining({ name: "root.event" }),
		);
		expect(eventMock).not.toHaveBeenCalled();
	});

	it("stores last event for codeExecutionResult parts but not function-call-only events", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-code" });
		await plugin.beforeRunCallback({ invocationContext: inv });

		const fcOnly = new Event({
			invocationId: "inv-code",
			author: "root",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "run", args: {} } }],
			},
		});
		await plugin.onEventCallback({ invocationContext: inv, event: fcOnly });

		updateMock.mockClear();
		eventMock.mockClear();
		await plugin.afterRunCallback({
			invocationContext: inv,
			result: { content: { role: "model", parts: [{ text: "fallback" }] } },
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({ output: "fallback" }),
		);

		const inv2 = makeInvocation({ invocationId: "inv-code-2" });
		await plugin.beforeRunCallback({ invocationContext: inv2 });
		const codeEvent = new Event({
			invocationId: "inv-code-2",
			author: "root",
			content: {
				role: "model",
				parts: [
					{
						codeExecutionResult: { outcome: "OK", output: "printed" },
					},
				],
			},
		});
		await plugin.onEventCallback({
			invocationContext: inv2,
			event: codeEvent,
		});
		updateMock.mockClear();
		await plugin.afterRunCallback({ invocationContext: inv2 });
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({ resultType: "event" }),
			}),
		);
	});

	it("afterRunCallback falls back to Event instances and plain string results", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-event-result" });
		await plugin.beforeRunCallback({ invocationContext: inv });
		updateMock.mockClear();
		eventMock.mockClear();

		const resultEvent = new Event({
			invocationId: "inv-event-result",
			author: "root",
			content: { role: "model", parts: [{ text: "from-event-instance" }] },
		});
		await plugin.afterRunCallback({
			invocationContext: inv,
			result: resultEvent,
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({ output: "from-event-instance" }),
		);
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({ name: "run_complete" }),
		);

		const invStr = makeInvocation({ invocationId: "inv-str-result" });
		await plugin.beforeRunCallback({ invocationContext: invStr });
		updateMock.mockClear();
		await plugin.afterRunCallback({
			invocationContext: invStr,
			result: "plain-string-output",
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({ output: "plain-string-output" }),
		);
	});

	it("afterRunCallback skips run_complete when there is no last event and no result", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-empty-end" });
		await plugin.beforeRunCallback({ invocationContext: inv });
		updateMock.mockClear();
		eventMock.mockClear();

		await plugin.afterRunCallback({ invocationContext: inv });
		expect(eventMock).not.toHaveBeenCalledWith(
			expect.objectContaining({ name: "run_complete" }),
		);
	});

	it("aggregates tokenUsage onto the trace and clears modelsUsed after the run", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-tokens" });
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
					promptTokenCount: 4,
					candidatesTokenCount: 6,
					totalTokenCount: 10,
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
					promptTokenCount: 1,
					candidatesTokenCount: 2,
					totalTokenCount: 3,
				},
			}),
		});

		updateMock.mockClear();
		await plugin.afterRunCallback({
			invocationContext: inv,
			result: "done",
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					usage: { input: 5, output: 8, total: 13 },
					totalInputTokens: 5,
					totalOutputTokens: 8,
					totalTokens: 13,
				}),
			}),
		);

		expect((plugin as any).modelsUsed.size).toBe(0);
		expect((plugin as any).modelsUsedKeysByInvocation.size).toBe(0);
		expect((plugin as any).tokenUsage.size).toBe(0);
		expect((plugin as any).lastEventByInvocation.size).toBe(0);
	});

	it("afterAgentCallback early-returns without a span and prefers lastEvent over result", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-agent-early" });
		const callbackContext = makeCallbackContext(inv);

		expect(
			await plugin.afterAgentCallback({
				agent: inv.agent,
				callbackContext,
				result: { content: { role: "model", parts: [{ text: "ignored" }] } },
			}),
		).toBeUndefined();
		expect(endMock).not.toHaveBeenCalled();

		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
		const last = new Event({
			invocationId: "inv-agent-early",
			author: "root",
			content: { role: "model", parts: [{ text: "last-wins" }] },
		});
		await plugin.onEventCallback({ invocationContext: inv, event: last });
		updateMock.mockClear();

		await plugin.afterAgentCallback({
			agent: inv.agent,
			callbackContext,
			result: { content: { role: "model", parts: [{ text: "result-lose" }] } },
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				output: expect.objectContaining({
					parts: [expect.objectContaining({ text: "last-wins" })],
				}),
			}),
		);
	});

	it("afterAgentCallback attaches modelsUsed and does not emit completed for root agents", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-root-models" });
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

		const llmRequest = new LlmRequest({ model: "gpt-test" });
		await plugin.beforeModelCallback({ callbackContext, llmRequest });
		await plugin.afterModelCallback({
			callbackContext,
			llmRequest,
			llmResponse: new LlmResponse({
				content: { role: "model", parts: [{ text: "x" }] },
			}),
		});

		eventMock.mockClear();
		updateMock.mockClear();
		await plugin.afterAgentCallback({
			agent: inv.agent,
			callbackContext,
			result: "agent-result",
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					modelsUsed: ["gpt-test"],
				}),
			}),
		);
		expect(eventMock).not.toHaveBeenCalledWith(
			expect.objectContaining({ name: "root_completed" }),
		);
	});

	it("beforeModelCallback records systemInstruction, tools, and modelConfig metadata", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation();
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
		generationMock.mockClear();

		const llmRequest = new LlmRequest({
			model: "gemini-2.5-flash",
			contents: [{ role: "user", parts: [{ text: "q" }] }],
			config: {
				temperature: 0.4,
				maxOutputTokens: 128,
				topK: 20,
				topP: 0.8,
				systemInstruction: "stay concise",
			},
			toolsDict: {
				search: makeTool("search"),
				lookup: makeTool("lookup"),
			},
		});
		await plugin.beforeModelCallback({ callbackContext, llmRequest });

		expect(generationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "root",
				model: "gemini-2.5-flash",
				metadata: expect.objectContaining({
					systemInstruction: "stay concise",
					hasTools: true,
					toolCount: 2,
					toolNames: expect.arrayContaining(["search", "lookup"]),
					modelConfig: {
						temperature: 0.4,
						maxOutputTokens: 128,
						topK: 20,
						topP: 0.8,
					},
					contentCount: 1,
				}),
			}),
		);
	});

	it("afterModelCallback early-returns without a generation and emits llm_response on agent span", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-no-gen" });
		const callbackContext = makeCallbackContext(inv);

		expect(
			await plugin.afterModelCallback({
				callbackContext,
				llmRequest: new LlmRequest({ model: "m" }),
				llmResponse: new LlmResponse({
					content: { role: "model", parts: [{ text: "x" }] },
				}),
			}),
		).toBeUndefined();
		expect(endMock).not.toHaveBeenCalled();

		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
		const agentSpan = spanMock.mock.results.at(-1)?.value;
		const llmRequest = new LlmRequest({ model: "gemini-2.5-flash" });
		await plugin.beforeModelCallback({ callbackContext, llmRequest });
		agentSpan.event.mockClear();

		await plugin.afterModelCallback({
			callbackContext,
			llmRequest,
			llmResponse: new LlmResponse({
				content: { role: "model", parts: [{ text: "from-content" }] },
				finishReason: "STOP",
			}),
		});

		expect(agentSpan.event).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "llm_response",
				metadata: expect.objectContaining({
					model: "gemini-2.5-flash",
					finishReason: "STOP",
					outputPreview: "from-content",
				}),
			}),
		);
	});

	it("afterModelCallback prefers llmResponse.text and skips token recording without usageMetadata", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-text-pref" });
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

		const llmRequest = new LlmRequest({ model: "m1" });
		await plugin.beforeModelCallback({ callbackContext, llmRequest });
		updateMock.mockClear();

		await plugin.afterModelCallback({
			callbackContext,
			llmRequest,
			llmResponse: new LlmResponse({
				content: { role: "model", parts: [{ text: "content-text" }] },
				text: "explicit-text-wins",
			}),
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					outputText: "explicit-text-wins",
					textPreview: "explicit-text-wins",
				}),
				usage: undefined,
			}),
		);
		expect((plugin as any).tokenUsage.has("inv-text-pref")).toBe(false);
	});

	it("onModelErrorCallback shapes Error vs non-Error and emits llm_error on agent span", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-model-err" });
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
		const agentSpan = spanMock.mock.results.at(-1)?.value;

		const llmRequest = new LlmRequest({
			model: "broken",
			config: { systemInstruction: "sys" },
		});
		await plugin.beforeModelCallback({ callbackContext, llmRequest });
		updateMock.mockClear();
		agentSpan.event.mockClear();

		const err = new Error("boom");
		err.name = "TimeoutError";
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
					errorName: "TimeoutError",
					errorMessage: "boom",
					model: "broken",
					systemInstruction: "sys",
				}),
			}),
		);
		expect(agentSpan.event).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "llm_error",
				metadata: expect.objectContaining({
					errorMessage: "boom",
					model: "broken",
				}),
			}),
		);

		await plugin.beforeModelCallback({ callbackContext, llmRequest });
		updateMock.mockClear();
		agentSpan.event.mockClear();
		await plugin.onModelErrorCallback({
			callbackContext,
			llmRequest,
			error: "string-failure",
		});
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				statusMessage: "string-failure",
				metadata: expect.objectContaining({
					errorName: "Error",
					errorStack: undefined,
				}),
			}),
		);
		expect(agentSpan.event).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "llm_error",
				metadata: expect.objectContaining({
					errorMessage: "string-failure",
					errorStack: undefined,
				}),
			}),
		);
	});

	it("onModelErrorCallback no-ops generation updates when generation is missing", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-no-gen-err" });
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
		const agentSpan = spanMock.mock.results.at(-1)?.value;
		updateMock.mockClear();
		agentSpan.event.mockClear();

		await plugin.onModelErrorCallback({
			callbackContext,
			llmRequest: new LlmRequest({ model: "ghost" }),
			error: new Error("no gen"),
		});

		expect(updateMock).not.toHaveBeenCalled();
		expect(agentSpan.event).toHaveBeenCalledWith(
			expect.objectContaining({ name: "llm_error" }),
		);
	});

	it("beforeToolCallback early-returns without agent span and uses unknown tool key", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-tool-early" });

		expect(
			await plugin.beforeToolCallback({
				tool: makeTool(),
				toolArgs: { q: 1 },
				toolContext: new ToolContext(inv, { functionCallId: "fc-x" }),
			}),
		).toBeUndefined();
		expect(spanMock).not.toHaveBeenCalled();

		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
		const agentSpan = spanMock.mock.results.at(-1)?.value;
		agentSpan.span.mockClear();

		const toolContext = new ToolContext(inv, {});
		await plugin.beforeToolCallback({
			tool: makeTool("anon"),
			toolArgs: { a: 1 },
			toolContext,
		});
		expect(agentSpan.span).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "anon",
				metadata: expect.objectContaining({
					functionCallId: undefined,
				}),
			}),
		);
		expect((plugin as any).toolSpans.has("inv-tool-early:tool:unknown")).toBe(
			true,
		);
	});

	it("afterToolCallback early-returns without tool span and emits completed on agent span", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-after-tool" });
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

		expect(
			await plugin.afterToolCallback({
				tool: makeTool(),
				toolArgs: {},
				toolContext: new ToolContext(inv, { functionCallId: "missing" }),
				result: { ok: false },
			}),
		).toBeUndefined();

		const toolContext = new ToolContext(inv, { functionCallId: "fc-ok" });
		await plugin.beforeToolCallback({
			tool: makeTool("done-tool"),
			toolArgs: { x: 1 },
			toolContext,
		});
		const agentSpan = spanMock.mock.results[0]?.value;
		agentSpan.event.mockClear();
		updateMock.mockClear();

		await plugin.afterToolCallback({
			tool: makeTool("done-tool"),
			toolArgs: { x: 1 },
			toolContext,
			result: { ok: true, value: 9 },
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				output: { ok: true, value: 9 },
				metadata: expect.objectContaining({
					resultType: "object",
					resultPreview: expect.stringContaining("ok"),
				}),
			}),
		);
		expect(endMock).toHaveBeenCalled();
		expect(agentSpan.event).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "done-tool_completed",
				output: { ok: true, value: 9 },
			}),
		);
		expect((plugin as any).toolSpans.has("inv-after-tool:tool:fc-ok")).toBe(
			false,
		);
	});

	it("onToolErrorCallback updates tool span for Error and still emits agent error without span", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-tool-err" });
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
		const agentSpan = spanMock.mock.results.at(-1)?.value;

		const toolContext = new ToolContext(inv, { functionCallId: "fc-err" });
		await plugin.beforeToolCallback({
			tool: makeTool("explode"),
			toolArgs: { n: 2 },
			toolContext,
		});
		updateMock.mockClear();
		agentSpan.event.mockClear();

		const err = new Error("tool failed");
		err.name = "ToolError";
		await plugin.onToolErrorCallback({
			tool: makeTool("explode"),
			toolArgs: { n: 2 },
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
					toolArgs: { n: 2 },
				}),
			}),
		);
		expect(agentSpan.event).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "explode_error",
				metadata: expect.objectContaining({
					errorMessage: "tool failed",
					toolName: "explode",
					functionCallId: "fc-err",
				}),
			}),
		);

		updateMock.mockClear();
		agentSpan.event.mockClear();
		await plugin.onToolErrorCallback({
			tool: makeTool("ghost"),
			toolArgs: {},
			toolContext: new ToolContext(inv, { functionCallId: "no-span" }),
			error: "string-tool-boom",
		});
		expect(updateMock).not.toHaveBeenCalled();
		expect(agentSpan.event).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "ghost_error",
				metadata: expect.objectContaining({
					errorMessage: "string-tool-boom",
					errorStack: undefined,
				}),
			}),
		);
	});

	it("afterAgentCallback falls back to plain result when no last event exists", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-agent-plain" });
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
		updateMock.mockClear();

		await plugin.afterAgentCallback({
			agent: inv.agent,
			callbackContext,
			result: "plain-agent-output",
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				output: "plain-agent-output",
				metadata: expect.objectContaining({
					outputText: "plain-agent-output",
				}),
			}),
		);
	});

	it("beforeAgentCallback serializes missing userContent as null input", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({
			invocationId: "inv-no-user",
			userContent: undefined,
		});
		spanMock.mockClear();

		await plugin.beforeAgentCallback({
			agent: inv.agent,
			callbackContext: makeCallbackContext(inv),
		});

		expect(spanMock).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "root",
				input: null,
				metadata: expect.objectContaining({
					inputText: "",
					hasSubAgents: false,
					subAgentCount: 0,
					subAgentNames: [],
				}),
			}),
		);
	});

	it("getOrCreateTrace metadata includes app/branch/agent identity", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		traceMock.mockClear();

		await plugin.beforeRunCallback({
			invocationContext: makeInvocation({
				invocationId: "inv-meta",
				appName: "demo-app",
				branch: "feature/x",
				agent: {
					name: "orchestrator",
					constructor: { name: "SequentialAgent" },
					parentAgent: undefined,
					subAgents: [],
					description: "orch",
				},
			}),
		});

		expect(traceMock).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "inv-meta",
				name: "orchestrator-session",
				userId: "user-1",
				sessionId: "sess-1",
				metadata: expect.objectContaining({
					appName: "demo-app",
					branch: "feature/x",
					agentName: "orchestrator",
					agentType: "SequentialAgent",
				}),
			}),
		);
	});

	it("recordModelUsage ignores falsy model names", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-no-model" });
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });

		await plugin.beforeModelCallback({
			callbackContext,
			llmRequest: new LlmRequest({ model: undefined }),
		});
		await plugin.afterModelCallback({
			callbackContext,
			llmRequest: new LlmRequest({ model: undefined }),
			llmResponse: new LlmResponse({
				content: { role: "model", parts: [{ text: "y" }] },
			}),
		});

		expect((plugin as any).modelsUsed.size).toBe(0);
	});

	it("afterRunCallback handles Event results without content via instanceof branch", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-event-result" });
		await plugin.beforeRunCallback({ invocationContext: inv });

		const serializeSpy = vi.spyOn(plugin as any, "serializeContent");
		const plainSpy = vi.spyOn(plugin as any, "toPlainText");
		const bareEvent = new Event({ author: "agent" });

		await plugin.afterRunCallback({
			invocationContext: inv,
			result: bareEvent,
		});

		expect(bareEvent instanceof Event).toBe(true);
		expect(serializeSpy).toHaveBeenCalledWith(bareEvent.content);
		expect(plainSpy).toHaveBeenCalledWith(bareEvent.content);
		serializeSpy.mockRestore();
		plainSpy.mockRestore();
	});

	it("toPlainText unwraps duck objects with nested content property", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-nested-content" });
		await plugin.beforeRunCallback({ invocationContext: inv });
		updateMock.mockClear();

		await plugin.afterRunCallback({
			invocationContext: inv,
			result: {
				content: { role: "model", parts: [{ text: "nested-plain" }] },
			},
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				output: "nested-plain",
			}),
		);
	});
});
