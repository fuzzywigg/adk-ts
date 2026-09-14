import type { BaseAgent, InvocationContext } from "@adk/agents";
import { StreamingMode } from "@adk/agents/run-config";
import { Event } from "@adk/events";
import { EventActions } from "@adk/events/event-actions";
import { SingleFlow } from "@adk/flows";
import type { LlmResponse } from "@adk/models";
import { LlmRequest } from "@adk/models";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handleFunctionCallsAsyncMock = vi.hoisted(() => vi.fn());
const generateAuthEventMock = vi.hoisted(() => vi.fn());
const populateClientFunctionCallIdMock = vi.hoisted(() => vi.fn());
const getLongRunningFunctionCallsMock = vi.hoisted(() => vi.fn());

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debugArray: vi.fn(),
		debugStructured: vi.fn(),
	})),
}));

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debugArray: vi.fn(),
		debugStructured: vi.fn(),
	})),
}));

vi.mock("@adk/flows/llm-flows/functions", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@adk/flows/llm-flows/functions")>();
	return {
		...actual,
		handleFunctionCallsAsync: handleFunctionCallsAsyncMock,
		generateAuthEvent: generateAuthEventMock,
		populateClientFunctionCallId: populateClientFunctionCallIdMock,
		getLongRunningFunctionCalls: getLongRunningFunctionCallsMock,
	};
});

class TestLlmFlow extends SingleFlow {
	public _runOneStepAsync = vi.fn();
}

class InspectableFlow extends SingleFlow {}

const mockAgent = {
	name: "test-agent",
} as BaseAgent;

const mockContext = {
	invocationId: "test-inv-123",
	agent: mockAgent,
	branch: "test-branch",
} as InvocationContext;

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
	const items: T[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

beforeEach(() => {
	handleFunctionCallsAsyncMock.mockReset();
	generateAuthEventMock.mockReset();
	populateClientFunctionCallIdMock.mockReset();
	getLongRunningFunctionCallsMock.mockReset();
	getLongRunningFunctionCallsMock.mockReturnValue(new Set());
});

describe("BaseLlmFlow.runAsync", () => {
	let flow: TestLlmFlow;

	beforeEach(() => {
		vi.clearAllMocks();
		handleFunctionCallsAsyncMock.mockReset();
		generateAuthEventMock.mockReset();
		populateClientFunctionCallIdMock.mockReset();
		getLongRunningFunctionCallsMock.mockReset();
		getLongRunningFunctionCallsMock.mockReturnValue(new Set());
		flow = new TestLlmFlow();
	});

	it("should run steps until a final response event is yielded", async () => {
		const nonFinalEvent = new Event({ author: "agent" });
		vi.spyOn(nonFinalEvent, "isFinalResponse").mockReturnValue(false);

		const finalEvent = new Event({ author: "agent" });
		vi.spyOn(finalEvent, "isFinalResponse").mockReturnValue(true);

		flow._runOneStepAsync
			.mockImplementationOnce(async function* () {
				yield nonFinalEvent;
			})
			.mockImplementationOnce(async function* () {
				yield finalEvent;
			});

		const yieldedEvents = [];
		for await (const event of flow.runAsync(mockContext)) {
			yieldedEvents.push(event);
		}

		expect(flow._runOneStepAsync).toHaveBeenCalledTimes(2);
		expect(flow._runOneStepAsync).toHaveBeenCalledWith(mockContext);

		expect(yieldedEvents).toHaveLength(2);
		expect(yieldedEvents[0]).toBe(nonFinalEvent);
		expect(yieldedEvents[1]).toBe(finalEvent);
	});

	it("should break the loop if a step yields no events", async () => {
		flow._runOneStepAsync.mockImplementationOnce(async function* () {});

		const yieldedEvents = [];
		for await (const event of flow.runAsync(mockContext)) {
			yieldedEvents.push(event);
		}

		expect(flow._runOneStepAsync).toHaveBeenCalledTimes(1);

		expect(yieldedEvents).toHaveLength(0);
	});

	it("should throw an error if the last event of a step is partial", async () => {
		const partialEvent = new Event({ author: "agent", partial: true });
		vi.spyOn(partialEvent, "isFinalResponse").mockReturnValue(false);

		flow._runOneStepAsync.mockImplementation(async function* () {
			yield partialEvent;
		});

		const generator = flow.runAsync(mockContext);

		await generator.next();

		await expect(generator.next()).rejects.toThrow(
			"Last event shouldn't be partial. LLM max output limit may be reached.",
		);
	});

	it("should continue looping if a step's last event is not final and not partial", async () => {
		const nonFinalEvent1 = new Event({ author: "agent", partial: false });
		vi.spyOn(nonFinalEvent1, "isFinalResponse").mockReturnValue(false);

		const nonFinalEvent2 = new Event({ author: "agent", partial: false });
		vi.spyOn(nonFinalEvent2, "isFinalResponse").mockReturnValue(false);

		const finalEvent = new Event({ author: "agent" });
		vi.spyOn(finalEvent, "isFinalResponse").mockReturnValue(true);

		flow._runOneStepAsync
			.mockImplementationOnce(async function* () {
				yield nonFinalEvent1;
			})
			.mockImplementationOnce(async function* () {
				yield nonFinalEvent2;
			})
			.mockImplementationOnce(async function* () {
				yield finalEvent;
			});

		const yieldedEvents = [];
		for await (const event of flow.runAsync(mockContext)) {
			yieldedEvents.push(event);
		}

		expect(flow._runOneStepAsync).toHaveBeenCalledTimes(3);
		expect(yieldedEvents).toHaveLength(3);
	});
});

describe("BaseLlmFlow.runLive", () => {
	it("delegates to runAsync", async () => {
		const flow = new TestLlmFlow();
		const finalEvent = new Event({ author: "agent" });
		vi.spyOn(finalEvent, "isFinalResponse").mockReturnValue(true);
		flow._runOneStepAsync.mockImplementation(async function* () {
			yield finalEvent;
		});

		const events = await collect(flow.runLive(mockContext));
		expect(events).toEqual([finalEvent]);
		expect(flow._runOneStepAsync).toHaveBeenCalledWith(mockContext);
	});
});

function makeCtx(overrides: Record<string, unknown> = {}): InvocationContext {
	return {
		invocationId: "inv",
		branch: "main",
		session: { state: {}, events: [] },
		runConfig: {},
		incrementLlmCallCount: vi.fn(),
		...overrides,
	} as unknown as InvocationContext;
}

describe("BaseLlmFlow._preprocessAsync", () => {
	it("returns early for agents without canonicalTools", async () => {
		const flow = new InspectableFlow();
		const llmRequest = new LlmRequest();
		const events = await collect(
			flow._preprocessAsync(mockContext, llmRequest),
		);
		expect(events).toEqual([]);
	});

	it("yields request processor events and deduplicates tools by name", async () => {
		const flow = new InspectableFlow();
		const processorEvent = new Event({ author: "processor" });
		flow.requestProcessors = [
			{
				runAsync: async function* () {
					yield processorEvent;
				},
			},
		];

		const processA = vi.fn(async () => undefined);
		const processB = vi.fn(async () => undefined);
		const processDup = vi.fn(async () => undefined);
		const agent = {
			name: "tool-agent",
			canonicalTools: async () => [
				{
					name: "search",
					description: "search tool",
					isLongRunning: false,
					processLlmRequest: processA,
				},
				{
					name: "search",
					description: "duplicate",
					isLongRunning: true,
					processLlmRequest: processDup,
				},
				{
					name: "lookup",
					description: "x".repeat(60),
					isLongRunning: true,
					processLlmRequest: processB,
				},
				{
					description: "unnamed skipped during dedup",
					processLlmRequest: vi.fn(),
				},
			],
		};

		const ctx = makeCtx({ agent });

		const events = await collect(flow._preprocessAsync(ctx, new LlmRequest()));
		expect(events).toEqual([processorEvent]);
		expect(processA).toHaveBeenCalledTimes(1);
		expect(processB).toHaveBeenCalledTimes(1);
		expect(processDup).not.toHaveBeenCalled();
	});

	it("stops the model call when endInvocation is set during preprocess", async () => {
		const flow = new InspectableFlow();
		flow.requestProcessors = [];
		const agent = {
			name: "end-agent",
			canonicalTools: async () => [],
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { parts: [{ text: "should not run" }] } };
				}),
			},
		};
		const ctx = makeCtx({
			agent,
			endInvocation: true,
		});

		const events = await collect(flow._runOneStepAsync(ctx));
		expect(events).toEqual([]);
		expect(agent.canonicalModel.generateContentAsync).not.toHaveBeenCalled();
	});
});

describe("BaseLlmFlow callbacks and finalize", () => {
	it("returns undefined from before/after callbacks when agent lacks canonical hooks", async () => {
		const flow = new InspectableFlow();
		const llmRequest = new LlmRequest();
		const modelEvent = new Event({ author: "agent" });
		await expect(
			flow._handleBeforeModelCallback(mockContext, llmRequest, modelEvent),
		).resolves.toBeUndefined();
		await expect(
			flow._handleAfterModelCallback(
				mockContext,
				{ content: { parts: [{ text: "x" }] } } as LlmResponse,
				modelEvent,
			),
		).resolves.toBeUndefined();
	});

	it("short-circuits before-model callback when a sync callback returns content", async () => {
		const flow = new InspectableFlow();
		const response = { content: { parts: [{ text: "cached" }] } };
		const agent = {
			name: "cb-agent",
			canonicalBeforeModelCallbacks: [
				() => undefined,
				() => response,
				() => ({ content: { parts: [{ text: "later" }] } }),
			],
		};
		const ctx = makeCtx({ agent });
		const result = await flow._handleBeforeModelCallback(
			ctx,
			new LlmRequest(),
			new Event({ author: "cb-agent" }),
		);
		expect(result).toBe(response);
	});

	it("awaits async after-model callbacks and returns the first truthy value", async () => {
		const flow = new InspectableFlow();
		const altered = { content: { parts: [{ text: "altered" }] } };
		const agent = {
			name: "cb-agent",
			canonicalAfterModelCallbacks: [
				async () => undefined,
				async () => altered,
			],
		};
		const ctx = makeCtx({ agent });
		const result = await flow._handleAfterModelCallback(
			ctx,
			{ content: { parts: [{ text: "raw" }] } } as LlmResponse,
			new Event({ author: "cb-agent" }),
		);
		expect(result).toBe(altered);
	});

	it("merges non-null llm response fields and skips empty postprocess responses", async () => {
		const flow = new InspectableFlow();
		const llmRequest = new LlmRequest();
		const modelEvent = new Event({
			id: "evt-1",
			author: "agent",
			invocationId: "inv",
		});
		const llmResponse = {
			content: { role: "model", parts: [{ text: "hello" }] },
			errorCode: null,
			partial: false,
		} as unknown as LlmResponse;

		const finalized = flow._finalizeModelResponseEvent(
			llmRequest,
			llmResponse,
			modelEvent,
		);
		expect(finalized.content).toEqual(llmResponse.content);
		expect(finalized.partial).toBe(false);
		expect(finalized.author).toBe("agent");

		const empty = await collect(
			flow._postprocessAsync(
				mockContext,
				llmRequest,
				{} as LlmResponse,
				modelEvent,
			),
		);
		expect(empty).toEqual([]);

		const withError = await collect(
			flow._postprocessAsync(
				mockContext,
				llmRequest,
				{ errorCode: "429" } as LlmResponse,
				modelEvent,
			),
		);
		expect(withError).toHaveLength(1);
		expect(withError[0].author).toBe("agent");

		const interrupted = await collect(
			flow._postprocessAsync(
				mockContext,
				llmRequest,
				{ interrupted: true } as LlmResponse,
				modelEvent,
			),
		);
		expect(interrupted).toHaveLength(1);
	});

	it("resolves transfer targets and throws when agent is missing", () => {
		const flow = new InspectableFlow();
		const child = { name: "child" } as BaseAgent;
		const root = {
			name: "root",
			findAgent: vi.fn((name: string) =>
				name === "child" ? child : undefined,
			),
		};
		const ctx = {
			agent: { rootAgent: root },
		} as unknown as InvocationContext;

		expect(flow._getAgentToRun(ctx, "child")).toBe(child);
		expect(() => flow._getAgentToRun(ctx, "missing")).toThrow(
			/Agent missing not found/,
		);
	});
});

describe("BaseLlmFlow._callLlmAsync", () => {
	it("yields before-model callback content without calling the model", async () => {
		const flow = new InspectableFlow();
		const cached = { content: { parts: [{ text: "from-callback" }] } };
		const agent = {
			name: "llm-agent",
			canonicalBeforeModelCallbacks: [() => cached],
			canonicalModel: {
				model: "fake-model",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { parts: [{ text: "model" }] } };
				}),
			},
		};
		const ctx = makeCtx({ agent });

		const responses = await collect(
			flow._callLlmAsync(
				ctx,
				new LlmRequest(),
				new Event({ author: "llm-agent" }),
			),
		);
		expect(responses).toEqual([cached]);
		expect(agent.canonicalModel.generateContentAsync).not.toHaveBeenCalled();
		expect(ctx.incrementLlmCallCount).not.toHaveBeenCalled();
	});

	it("labels requests, dedups function declarations, and yields model responses", async () => {
		const flow = new InspectableFlow();
		const llmResponse = {
			content: { parts: [{ text: "ok" }] },
			usageMetadata: { totalTokenCount: 12 },
			finishReason: "STOP",
		};
		const agent = {
			name: "billing-agent",
			canonicalModel: {
				model: "fake-model",
				generateContentAsync: vi.fn(async function* () {
					yield llmResponse;
				}),
			},
		};
		const ctx = makeCtx({
			agent,
			runConfig: { streamingMode: "none", supportCfc: true },
		});

		const llmRequest = new LlmRequest();
		llmRequest.config = {
			tools: [
				{
					functionDeclarations: [
						{ name: "alpha" },
						{ name: "alpha" },
						{ name: "beta" },
					],
				},
				{ name: "alpha" },
				{ name: "gamma" },
				{ mystery: true },
			],
		} as any;
		llmRequest.contents = [{ role: "user", parts: [{ text: "hi" }] }];
		llmRequest.appendInstructions(["Be brief and helpful with long text here"]);

		const responses = await collect(
			flow._callLlmAsync(
				ctx,
				llmRequest,
				new Event({ id: "m1", author: "billing-agent" }),
			),
		);

		expect(responses).toEqual([llmResponse]);
		expect(ctx.incrementLlmCallCount).toHaveBeenCalledTimes(1);
		expect(llmRequest.config?.labels?.adk_agent_name).toBe("billing-agent");
		const tools = llmRequest.config?.tools as any[];
		expect(tools.some((t) => t?.functionDeclarations?.length === 2)).toBe(true);
		expect(tools.some((t) => t?.name === "gamma")).toBe(true);
	});

	it("passes isStreaming=true for SSE and yields after-callback alterations across chunks", async () => {
		const flow = new InspectableFlow();
		const chunk1 = {
			content: { parts: [{ text: "a" }] },
			partial: true,
		};
		const chunk2 = {
			content: { parts: [{ text: "b" }] },
			finishReason: "STOP",
		};
		const altered = { content: { parts: [{ text: "altered-b" }] } };
		const generateContentAsync = vi.fn(async function* (
			_req: unknown,
			streaming?: boolean,
		) {
			expect(streaming).toBe(true);
			yield chunk1;
			yield chunk2;
		});
		const agent = {
			name: "sse-agent",
			canonicalModel: { model: "m", generateContentAsync },
			canonicalAfterModelCallbacks: [
				({ llmResponse }: { llmResponse: LlmResponse }) =>
					llmResponse === chunk2 ? altered : undefined,
			],
		};
		const ctx = makeCtx({
			agent,
			runConfig: { streamingMode: StreamingMode.SSE },
		});

		const responses = await collect(
			flow._callLlmAsync(
				ctx,
				new LlmRequest(),
				new Event({ id: "sse-1", author: "sse-agent" }),
			),
		);

		expect(responses).toEqual([chunk1, altered]);
		expect(generateContentAsync).toHaveBeenCalledWith(expect.anything(), true);
	});

	it("formats nested tool names and empty contents as none", async () => {
		const flow = new InspectableFlow();
		const llmResponse = { content: { parts: [{ text: "ok" }] } };
		const agent = {
			name: "tool-shape-agent",
			canonicalModel: {
				model: "m",
				generateContentAsync: vi.fn(async function* () {
					yield llmResponse;
				}),
			},
		};
		const ctx = makeCtx({ agent });
		const llmRequest = new LlmRequest();
		llmRequest.config = {
			labels: { adk_agent_name: "prelabeled" },
			tools: [
				{ function: { name: "nestedFn" } },
				{ function: { function: { name: "doubleNested" } } },
				{ other: true },
			],
		} as any;

		const responses = await collect(
			flow._callLlmAsync(
				ctx,
				llmRequest,
				new Event({ id: "t1", author: "tool-shape-agent" }),
			),
		);

		expect(responses).toEqual([llmResponse]);
		expect(llmRequest.config?.labels?.adk_agent_name).toBe("prelabeled");
	});

	it("returns early when before/after callback lists are nullish", async () => {
		const flow = new InspectableFlow();
		const agent = {
			name: "null-cb-agent",
			canonicalBeforeModelCallbacks: null,
			canonicalAfterModelCallbacks: null,
			canonicalModel: {
				model: "m",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { parts: [{ text: "raw" }] } };
				}),
			},
		};
		const ctx = makeCtx({ agent });
		const responses = await collect(
			flow._callLlmAsync(
				ctx,
				new LlmRequest(),
				new Event({ author: "null-cb-agent" }),
			),
		);
		expect(responses).toHaveLength(1);
		expect((responses[0] as LlmResponse).content?.parts?.[0]).toEqual({
			text: "raw",
		});
	});

	it("awaits async before-model callbacks before short-circuiting", async () => {
		const flow = new InspectableFlow();
		const cached = { content: { parts: [{ text: "async-cached" }] } };
		const agent = {
			name: "async-before",
			canonicalBeforeModelCallbacks: [async () => cached],
			canonicalModel: {
				model: "m",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { parts: [{ text: "model" }] } };
				}),
			},
		};
		const ctx = makeCtx({ agent });
		const responses = await collect(
			flow._callLlmAsync(
				ctx,
				new LlmRequest(),
				new Event({ author: "async-before" }),
			),
		);
		expect(responses).toEqual([cached]);
		expect(agent.canonicalModel.generateContentAsync).not.toHaveBeenCalled();
	});
});

describe("BaseLlmFlow._runOneStepAsync model + postprocess", () => {
	it("yields model text through postprocess end-to-end", async () => {
		const flow = new InspectableFlow();
		flow.requestProcessors = [];
		flow.responseProcessors = [];
		const agent = {
			name: "one-step",
			canonicalTools: async () => [],
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield {
						content: { role: "model", parts: [{ text: "hello world" }] },
						finishReason: "STOP",
					};
				}),
			},
		};
		const ctx = makeCtx({ agent });

		const events = await collect(flow._runOneStepAsync(ctx));
		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]).toEqual({ text: "hello world" });
		expect(events[0].author).toBe("one-step");
		expect(ctx.incrementLlmCallCount).toHaveBeenCalledTimes(1);
	});

	it("yields response-processor events before the finalized model event", async () => {
		const flow = new InspectableFlow();
		flow.requestProcessors = [];
		const processorEvent = new Event({ author: "resp-processor" });
		flow.responseProcessors = [
			{
				runAsync: async function* () {
					yield processorEvent;
				},
			},
		];
		const agent = {
			name: "proc-agent",
			canonicalTools: async () => [],
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { role: "model", parts: [{ text: "x" }] } };
				}),
			},
		};

		const events = await collect(flow._runOneStepAsync(makeCtx({ agent })));
		expect(events[0]).toBe(processorEvent);
		expect(events[1].content?.parts?.[0]).toEqual({ text: "x" });
	});

	it("handles function-call responses via handleFunctionCallsAsync", async () => {
		const flow = new InspectableFlow();
		flow.requestProcessors = [];
		flow.responseProcessors = [];
		const functionResponse = new Event({
			author: "one-step",
			content: {
				role: "user",
				parts: [
					{ functionResponse: { name: "search", response: { ok: true } } },
				],
			},
		});
		handleFunctionCallsAsyncMock.mockResolvedValue(functionResponse);
		generateAuthEventMock.mockReturnValue(null);

		const agent = {
			name: "one-step",
			canonicalTools: async () => [],
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield {
						content: {
							role: "model",
							parts: [
								{
									functionCall: {
										name: "search",
										args: { q: "adk" },
										id: "call-1",
									},
								},
							],
						},
					};
				}),
			},
		};

		const events = await collect(flow._runOneStepAsync(makeCtx({ agent })));
		expect(events.length).toBeGreaterThanOrEqual(2);
		expect(events[0].getFunctionCalls()?.[0]?.name).toBe("search");
		expect(events).toContain(functionResponse);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalled();
		expect(populateClientFunctionCallIdMock).toHaveBeenCalled();
	});
});

describe("BaseLlmFlow._postprocessHandleFunctionCallsAsync", () => {
	it("yields nothing when handleFunctionCallsAsync returns null", async () => {
		const flow = new InspectableFlow();
		handleFunctionCallsAsyncMock.mockResolvedValue(null);
		const callEvent = new Event({
			author: "agent",
			content: {
				parts: [{ functionCall: { name: "noop", args: {}, id: "c1" } }],
			},
		});

		const events = await collect(
			flow._postprocessHandleFunctionCallsAsync(
				mockContext,
				callEvent,
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
	});

	it("yields auth event before the function response when present", async () => {
		const flow = new InspectableFlow();
		const functionResponse = new Event({
			author: "agent",
			content: {
				parts: [{ functionResponse: { name: "tool", response: {} } }],
			},
		});
		const authEvent = new Event({ author: "user", id: "auth-1" });
		handleFunctionCallsAsyncMock.mockResolvedValue(functionResponse);
		generateAuthEventMock.mockReturnValue(authEvent);

		const events = await collect(
			flow._postprocessHandleFunctionCallsAsync(
				mockContext,
				new Event({ author: "agent" }),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([authEvent, functionResponse]);
	});

	it("transfers to another agent when actions.transferToAgent is set", async () => {
		const flow = new InspectableFlow();
		const transferEvent = new Event({ author: "child", id: "child-evt" });
		const child = {
			name: "child",
			runAsync: vi.fn(async function* () {
				yield transferEvent;
			}),
		};
		const root = {
			name: "root",
			findAgent: vi.fn((name: string) =>
				name === "child" ? child : undefined,
			),
		};
		const functionResponse = new Event({
			author: "root",
			actions: new EventActions({ transferToAgent: "child" }),
			content: {
				parts: [{ functionResponse: { name: "transfer", response: {} } }],
			},
		});
		handleFunctionCallsAsyncMock.mockResolvedValue(functionResponse);
		generateAuthEventMock.mockReturnValue(null);

		const ctx = makeCtx({
			agent: { name: "root", rootAgent: root },
		});

		const events = await collect(
			flow._postprocessHandleFunctionCallsAsync(
				ctx,
				new Event({ author: "root" }),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([functionResponse, transferEvent]);
		expect(child.runAsync).toHaveBeenCalledWith(ctx);
	});

	it("stops after function response when there is no transfer", async () => {
		const flow = new InspectableFlow();
		const functionResponse = new Event({
			author: "agent",
			actions: new EventActions({}),
			content: {
				parts: [{ functionResponse: { name: "tool", response: { v: 1 } } }],
			},
		});
		handleFunctionCallsAsyncMock.mockResolvedValue(functionResponse);
		generateAuthEventMock.mockReturnValue(null);

		const events = await collect(
			flow._postprocessHandleFunctionCallsAsync(
				mockContext,
				new Event({ author: "agent" }),
				new LlmRequest(),
			),
		);
		expect(events).toEqual([functionResponse]);
	});
});

describe("BaseLlmFlow._postprocessLive", () => {
	it("skips when response has no content, error, interrupt, or turnComplete", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		const events = await collect(
			flow._postprocessLive(
				mockContext,
				new LlmRequest(),
				{} as LlmResponse,
				new Event({ author: "agent" }),
			),
		);
		expect(events).toEqual([]);
	});

	it("finalizes and yields when only turnComplete is set", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		const events = await collect(
			flow._postprocessLive(
				mockContext,
				new LlmRequest(),
				{ turnComplete: true } as any,
				new Event({ id: "live-1", author: "agent", invocationId: "inv" }),
			),
		);
		expect(events).toHaveLength(1);
		expect(events[0].author).toBe("agent");
	});

	it("handles live function calls and prefers agentToRun.runLive", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		const liveChildEvent = new Event({ author: "child", id: "live-child" });
		const child = {
			name: "child",
			runLive: vi.fn(async function* () {
				yield liveChildEvent;
			}),
			runAsync: vi.fn(async function* () {
				yield new Event({ author: "child-async" });
			}),
		};
		const root = {
			name: "root",
			findAgent: vi.fn(() => child),
		};
		const functionResponse = new Event({
			author: "root",
			actions: new EventActions({ transferToAgent: "child" }),
			content: {
				parts: [{ functionResponse: { name: "transfer", response: {} } }],
			},
		});
		handleFunctionCallsAsyncMock.mockResolvedValue(functionResponse);

		const ctx = makeCtx({ agent: { name: "root", rootAgent: root } });
		const llmResponse = {
			content: {
				role: "model",
				parts: [
					{ functionCall: { name: "transfer", args: {}, id: "fc-live" } },
				],
			},
		} as LlmResponse;

		const events = await collect(
			flow._postprocessLive(
				ctx,
				new LlmRequest(),
				llmResponse,
				new Event({ id: "m", author: "root" }),
			),
		);

		expect(events[0].getFunctionCalls()?.[0]?.name).toBe("transfer");
		expect(events).toContain(functionResponse);
		expect(events).toContain(liveChildEvent);
		expect(child.runLive).toHaveBeenCalled();
		expect(child.runAsync).not.toHaveBeenCalled();
	});

	it("falls back to runAsync when runLive is unavailable", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		const asyncChildEvent = new Event({ author: "child", id: "async-child" });
		const child = {
			name: "child",
			runAsync: vi.fn(async function* () {
				yield asyncChildEvent;
			}),
		};
		const root = {
			name: "root",
			findAgent: vi.fn(() => child),
		};
		const functionResponse = new Event({
			author: "root",
			actions: new EventActions({ transferToAgent: "child" }),
			content: {
				parts: [{ functionResponse: { name: "transfer", response: {} } }],
			},
		});
		handleFunctionCallsAsyncMock.mockResolvedValue(functionResponse);

		const ctx = makeCtx({ agent: { name: "root", rootAgent: root } });
		const events = await collect(
			flow._postprocessLive(
				ctx,
				new LlmRequest(),
				{
					content: {
						parts: [{ functionCall: { name: "transfer", args: {}, id: "x" } }],
					},
				} as LlmResponse,
				new Event({ id: "m", author: "root" }),
			),
		);

		expect(events).toContain(asyncChildEvent);
		expect(child.runAsync).toHaveBeenCalled();
	});

	it("does not transfer when function response is null", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const events = await collect(
			flow._postprocessLive(
				mockContext,
				new LlmRequest(),
				{
					content: {
						parts: [{ functionCall: { name: "tool", args: {}, id: "y" } }],
					},
				} as LlmResponse,
				new Event({ id: "m", author: "agent" }),
			),
		);

		expect(events).toHaveLength(1);
		expect(events[0].getFunctionCalls()?.[0]?.name).toBe("tool");
	});
});

describe("BaseLlmFlow._finalizeModelResponseEvent long-running tools", () => {
	it("populates client call ids and longRunningToolIds for function calls", () => {
		const flow = new InspectableFlow();
		const longRunningIds = new Set(["call-lr"]);
		getLongRunningFunctionCallsMock.mockReturnValue(longRunningIds);

		const llmRequest = new LlmRequest();
		llmRequest.toolsDict = {
			slow: { name: "slow", isLongRunning: true },
		} as any;

		const modelEvent = new Event({ id: "me", author: "agent" });
		const llmResponse = {
			content: {
				role: "model",
				parts: [{ functionCall: { name: "slow", args: {}, id: "call-lr" } }],
			},
		} as LlmResponse;

		const finalized = flow._finalizeModelResponseEvent(
			llmRequest,
			llmResponse,
			modelEvent,
		);

		expect(populateClientFunctionCallIdMock).toHaveBeenCalledWith(finalized);
		expect(getLongRunningFunctionCallsMock).toHaveBeenCalled();
		expect(finalized.longRunningToolIds).toBe(longRunningIds);
	});

	it("still finalizes when content has no function calls (empty getFunctionCalls is truthy)", () => {
		const flow = new InspectableFlow();
		const emptyIds = new Set<string>();
		getLongRunningFunctionCallsMock.mockReturnValue(emptyIds);

		const finalized = flow._finalizeModelResponseEvent(
			new LlmRequest(),
			{ content: { role: "model", parts: [{ text: "plain" }] } } as LlmResponse,
			new Event({ id: "me", author: "agent" }),
		);

		expect(populateClientFunctionCallIdMock).toHaveBeenCalledWith(finalized);
		expect(getLongRunningFunctionCallsMock).toHaveBeenCalledWith([], {});
		expect(finalized.longRunningToolIds).toBe(emptyIds);
		expect(finalized.content?.parts?.[0]).toEqual({ text: "plain" });
	});
});

describe("BaseLlmFlow._postprocessAsync function-call path", () => {
	it("yields processor events, finalized call, and handler results", async () => {
		const flow = new InspectableFlow();
		const processorEvent = new Event({ author: "rp" });
		flow.responseProcessors = [
			{
				runAsync: async function* () {
					yield processorEvent;
				},
			},
		];
		const functionResponse = new Event({
			author: "agent",
			content: {
				parts: [{ functionResponse: { name: "f", response: {} } }],
			},
		});
		handleFunctionCallsAsyncMock.mockResolvedValue(functionResponse);
		generateAuthEventMock.mockReturnValue(null);

		const events = await collect(
			flow._postprocessAsync(
				mockContext,
				new LlmRequest(),
				{
					content: {
						parts: [
							{
								functionCall: {
									name: "f",
									args: { a: "1".repeat(120) },
									id: "fc",
								},
							},
						],
					},
				} as LlmResponse,
				new Event({ id: "m", author: "agent" }),
			),
		);

		expect(events[0]).toBe(processorEvent);
		expect(events[1].getFunctionCalls()?.[0]?.name).toBe("f");
		expect(events[2]).toBe(functionResponse);
	});
});

describe("BaseLlmFlow leftover edges (post #98 llm-flows deepen)", () => {
	it("_runOneStepAsync yields preprocess processor events before the model response", async () => {
		const flow = new InspectableFlow();
		const preprocessEvent = new Event({ author: "pre" });
		flow.requestProcessors = [
			{
				runAsync: async function* () {
					yield preprocessEvent;
				},
			},
		];
		flow.responseProcessors = [];
		const agent = {
			name: "pre-agent",
			canonicalTools: async () => [],
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { role: "model", parts: [{ text: "after-pre" }] } };
				}),
			},
		};

		const events = await collect(flow._runOneStepAsync(makeCtx({ agent })));
		expect(events[0]).toBe(preprocessEvent);
		expect(events[1].content?.parts?.[0]).toEqual({ text: "after-pre" });
	});

	it("_postprocessLive yields response processor events before finalized live event", async () => {
		const flow = new InspectableFlow();
		const processorEvent = new Event({ author: "live-rp" });
		flow.responseProcessors = [
			{
				runAsync: async function* () {
					yield processorEvent;
				},
			},
		];

		const events = await collect(
			flow._postprocessLive(
				mockContext,
				new LlmRequest(),
				{
					content: { role: "model", parts: [{ text: "live-text" }] },
				} as LlmResponse,
				new Event({ id: "m", author: "agent" }),
			),
		);

		expect(events[0]).toBe(processorEvent);
		expect(events[1].content?.parts?.[0]).toEqual({ text: "live-text" });
	});

	it("_callLlmAsync truncates system instructions longer than 100 characters", async () => {
		const flow = new InspectableFlow();
		flow.requestProcessors = [];
		flow.responseProcessors = [];
		const longInstruction = "y".repeat(150);
		const agent = {
			name: "long-si",
			canonicalTools: async () => [],
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* (req: LlmRequest) {
					expect(req.getSystemInstructionText()).toBe(longInstruction);
					yield { content: { role: "model", parts: [{ text: "ok" }] } };
				}),
			},
		};

		const llmRequest = new LlmRequest();
		llmRequest.appendInstructions([longInstruction]);
		const modelEvent = new Event({ id: "me", author: "long-si" });
		const responses = await collect(
			flow._callLlmAsync(makeCtx({ agent }), llmRequest, modelEvent),
		);
		expect(responses).toHaveLength(1);
		expect(agent.canonicalModel.generateContentAsync).toHaveBeenCalled();
	});

	it("_postprocessAsync handles functionCall with missing id", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		const functionResponse = new Event({
			author: "agent",
			content: {
				parts: [{ functionResponse: { name: "f", response: { ok: 1 } } }],
			},
		});
		handleFunctionCallsAsyncMock.mockResolvedValue(functionResponse);
		generateAuthEventMock.mockReturnValue(null);

		const events = await collect(
			flow._postprocessAsync(
				mockContext,
				new LlmRequest(),
				{
					content: {
						parts: [{ functionCall: { name: "f", args: { a: 1 } } }],
					},
				} as LlmResponse,
				new Event({ id: "m", author: "agent" }),
			),
		);

		expect(events[0].getFunctionCalls()?.[0]?.name).toBe("f");
		expect(events[1]).toBe(functionResponse);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalled();
	});

	it("_finalizeModelResponseEvent uses empty toolsDict when missing on request", () => {
		const flow = new InspectableFlow();
		const emptyIds = new Set<string>();
		getLongRunningFunctionCallsMock.mockReturnValue(emptyIds);
		const llmRequest = new LlmRequest();
		delete (llmRequest as any).toolsDict;

		const finalized = flow._finalizeModelResponseEvent(
			llmRequest,
			{
				content: {
					role: "model",
					parts: [{ functionCall: { name: "t", args: {}, id: "c1" } }],
				},
			} as LlmResponse,
			new Event({ id: "me", author: "agent" }),
		);

		expect(getLongRunningFunctionCallsMock).toHaveBeenCalledWith(
			expect.any(Array),
			{},
		);
		expect(finalized.longRunningToolIds).toBe(emptyIds);
	});

	it("_postprocessLive handles function calls when toolsDict is undefined", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		handleFunctionCallsAsyncMock.mockResolvedValue(null);
		const llmRequest = new LlmRequest();
		delete (llmRequest as any).toolsDict;

		const events = await collect(
			flow._postprocessLive(
				mockContext,
				llmRequest,
				{
					content: {
						parts: [{ functionCall: { name: "tool", args: {}, id: "y" } }],
					},
				} as LlmResponse,
				new Event({ id: "m", author: "agent" }),
			),
		);

		expect(events).toHaveLength(1);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			mockContext,
			expect.any(Event),
			{},
		);
	});

	it("_postprocessLive finalizes content without parts when turnComplete", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		const events = await collect(
			flow._postprocessLive(
				mockContext,
				new LlmRequest(),
				{
					turnComplete: true,
					content: { role: "model" },
				} as any,
				new Event({ id: "live-np", author: "agent" }),
			),
		);
		expect(events).toHaveLength(1);
		expect(events[0].author).toBe("agent");
	});

	it("_runOneStepAsync stops after preprocess when endInvocation is set", async () => {
		const flow = new InspectableFlow();
		const preprocessEvent = new Event({ author: "pre-end" });
		flow.requestProcessors = [
			{
				runAsync: async function* (_ctx, _req) {
					(_ctx as any).endInvocation = true;
					yield preprocessEvent;
				},
			},
		];
		const agent = {
			name: "end-agent",
			canonicalTools: async () => [],
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { role: "model", parts: [{ text: "should-not" }] } };
				}),
			},
		};

		const events = await collect(flow._runOneStepAsync(makeCtx({ agent })));
		expect(events).toEqual([preprocessEvent]);
		expect(agent.canonicalModel.generateContentAsync).not.toHaveBeenCalled();
	});
});

describe("BaseLlmFlow leftover edges", () => {
	it("__getLlm returns the agent canonicalModel reference", () => {
		const flow = new InspectableFlow();
		const model = { model: "gemini-2.5-flash" };
		const ctx = makeCtx({ agent: { name: "m-agent", canonicalModel: model } });
		expect(flow.__getLlm(ctx)).toBe(model);
	});

	it("_finalizeModelResponseEvent skips function-call helpers when content is absent", () => {
		const flow = new InspectableFlow();
		const finalized = flow._finalizeModelResponseEvent(
			new LlmRequest(),
			{ partial: true } as LlmResponse,
			new Event({ id: "me", author: "agent" }),
		);
		expect(populateClientFunctionCallIdMock).not.toHaveBeenCalled();
		expect(getLongRunningFunctionCallsMock).not.toHaveBeenCalled();
		expect(finalized.partial).toBe(true);
		expect(finalized.content).toBeUndefined();
	});

	it("_postprocessLive yields a finalized event for interrupted-only responses", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		const events = await collect(
			flow._postprocessLive(
				mockContext,
				new LlmRequest(),
				{ interrupted: true } as LlmResponse,
				new Event({ id: "live-int", author: "agent" }),
			),
		);
		expect(events).toHaveLength(1);
		expect(events[0].author).toBe("agent");
	});

	it("_postprocessLive yields a finalized event for errorCode-only responses", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		const events = await collect(
			flow._postprocessLive(
				mockContext,
				new LlmRequest(),
				{ errorCode: "RATE_LIMIT" } as LlmResponse,
				new Event({ id: "live-err", author: "agent" }),
			),
		);
		expect(events).toHaveLength(1);
		expect(events[0].author).toBe("agent");
	});

	it("_postprocessRunProcessorsAsync yields events from multiple processors in order", async () => {
		const flow = new InspectableFlow();
		const first = new Event({ author: "rp-1" });
		const second = new Event({ author: "rp-2" });
		flow.responseProcessors = [
			{
				runAsync: async function* () {
					yield first;
				},
			},
			{
				runAsync: async function* () {
					yield second;
				},
			},
		];
		const events = await collect(
			flow._postprocessRunProcessorsAsync(mockContext, {
				content: { parts: [{ text: "x" }] },
			} as LlmResponse),
		);
		expect(events).toEqual([first, second]);
	});

	it("_preprocessAsync processes a single named tool without entering dedup filtering", async () => {
		const flow = new InspectableFlow();
		const processOnly = vi.fn(async () => undefined);
		const agent = {
			name: "solo-tool",
			canonicalTools: async () => [
				{
					name: "only",
					description: "single tool",
					processLlmRequest: processOnly,
				},
			],
		};
		await collect(flow._preprocessAsync(makeCtx({ agent }), new LlmRequest()));
		expect(processOnly).toHaveBeenCalledTimes(1);
	});

	it("_postprocessHandleFunctionCallsAsync passes llmRequest.toolsDict to handleFunctionCallsAsync", async () => {
		const flow = new InspectableFlow();
		const toolsDict = { echo: { name: "echo" } };
		const llmRequest = new LlmRequest();
		llmRequest.toolsDict = toolsDict as any;
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		await collect(
			flow._postprocessHandleFunctionCallsAsync(
				mockContext,
				new Event({ author: "agent" }),
				llmRequest,
			),
		);

		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
			mockContext,
			expect.any(Event),
			toolsDict,
		);
	});

	it("_runOneStepAsync assigns a new model event id for each streamed postprocess yield", async () => {
		const flow = new InspectableFlow();
		flow.requestProcessors = [];
		flow.responseProcessors = [];
		const ids: string[] = [];
		const agent = {
			name: "stream-agent",
			canonicalTools: async () => [],
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { role: "model", parts: [{ text: "a" }] } };
					yield { content: { role: "model", parts: [{ text: "b" }] } };
				}),
			},
		};

		const events = await collect(flow._runOneStepAsync(makeCtx({ agent })));
		for (const event of events) {
			ids.push(event.id);
		}
		expect(ids).toHaveLength(2);
		expect(new Set(ids).size).toBe(2);
	});
});
