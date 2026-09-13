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
});
