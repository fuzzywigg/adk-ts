import type { BaseAgent, InvocationContext } from "@adk/agents";
import { Event } from "@adk/events";
import { SingleFlow } from "@adk/flows";
import type { LlmResponse } from "@adk/models";
import { LlmRequest } from "@adk/models";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("BaseLlmFlow.runAsync", () => {
	let flow: TestLlmFlow;

	beforeEach(() => {
		vi.clearAllMocks();
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
});
