import type { BaseAgent, InvocationContext } from "@adk/agents";
import { StreamingMode } from "@adk/agents/run-config";
import { Event } from "@adk/events";
import { EventActions } from "@adk/events/event-actions";
import { SingleFlow } from "@adk/flows";
import type { LlmResponse } from "@adk/models";
import { LlmRequest } from "@adk/models";
import { BaseTool } from "@adk/tools/base/base-tool";
import type { ToolContext } from "@adk/tools/tool-context";
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

	it("passes streaming=true when runConfig.streamingMode is SSE", async () => {
		const flow = new InspectableFlow();
		const generateContentAsync = vi.fn(async function* () {
			yield { content: { parts: [{ text: "sse" }] } };
		});
		const agent = {
			name: "sse-agent",
			canonicalModel: { model: "fake", generateContentAsync },
		};
		const ctx = makeCtx({
			agent,
			runConfig: { streamingMode: StreamingMode.SSE },
		});

		await collect(
			flow._callLlmAsync(
				ctx,
				new LlmRequest(),
				new Event({ author: "sse-agent" }),
			),
		);

		expect(generateContentAsync).toHaveBeenCalledWith(
			expect.any(LlmRequest),
			true,
		);
	});

	it("yields after-model callback result instead of raw model response", async () => {
		const flow = new InspectableFlow();
		const altered = { content: { parts: [{ text: "from-after" }] } };
		const agent = {
			name: "after-agent",
			canonicalAfterModelCallbacks: [() => altered],
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { parts: [{ text: "raw" }] } };
				}),
			},
		};
		const responses = await collect(
			flow._callLlmAsync(
				makeCtx({ agent }),
				new LlmRequest(),
				new Event({ author: "after-agent" }),
			),
		);
		expect(responses).toEqual([altered]);
	});

	it("treats falsy canonicalBefore/AfterModelCallbacks as no-ops", async () => {
		const flow = new InspectableFlow();
		const agent = {
			name: "falsy-cb-agent",
			canonicalBeforeModelCallbacks: null,
			canonicalAfterModelCallbacks: null,
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { parts: [{ text: "ok" }] } };
				}),
			},
		};
		const ctx = makeCtx({ agent });
		const llmRequest = new LlmRequest();
		const modelEvent = new Event({ author: "falsy-cb-agent" });

		await expect(
			flow._handleBeforeModelCallback(ctx, llmRequest, modelEvent),
		).resolves.toBeUndefined();
		await expect(
			flow._handleAfterModelCallback(
				ctx,
				{ content: { parts: [{ text: "x" }] } } as LlmResponse,
				modelEvent,
			),
		).resolves.toBeUndefined();

		const responses = await collect(
			flow._callLlmAsync(ctx, llmRequest, modelEvent),
		);
		expect(responses).toHaveLength(1);
		expect(responses[0].content?.parts?.[0]).toEqual({ text: "ok" });
	});
});

class FlowTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly impl: (
			args: Record<string, unknown>,
			context: ToolContext,
		) => Promise<unknown>,
	) {
		super(config);
	}

	async runAsync(args: Record<string, unknown>, context: ToolContext) {
		return this.impl(args, context);
	}
}

function llmAgentCtx(
	agentOverrides: Record<string, unknown> = {},
): InvocationContext {
	return makeCtx({
		agent: {
			name: "llm-agent",
			canonicalModel: "fake-model",
			canonicalBeforeToolCallbacks: [],
			canonicalAfterToolCallbacks: [],
			rootAgent: {
				name: "root",
				findAgent: vi.fn(),
			},
			...agentOverrides,
		},
	});
}

describe("BaseLlmFlow._finalizeModelResponseEvent function calls", () => {
	it("populates missing function call ids and longRunningToolIds", () => {
		const flow = new InspectableFlow();
		const llmRequest = new LlmRequest();
		llmRequest.toolsDict = {
			slow: new FlowTool(
				{ name: "slow", description: "slow", isLongRunning: true },
				async () => ({ ok: true }),
			),
			fast: new FlowTool({ name: "fast", description: "fast" }, async () => ({
				ok: true,
			})),
		};

		const modelEvent = new Event({
			id: "evt-fc",
			author: "agent",
			invocationId: "inv",
		});
		const llmResponse = {
			content: {
				role: "model",
				parts: [
					{ functionCall: { name: "slow", args: {} } },
					{ functionCall: { name: "fast", id: "keep-me", args: {} } },
				],
			},
		} as LlmResponse;

		const finalized = flow._finalizeModelResponseEvent(
			llmRequest,
			llmResponse,
			modelEvent,
		);
		const calls = finalized.getFunctionCalls();
		expect(calls[0].id?.startsWith("adk-")).toBe(true);
		expect(calls[1].id).toBe("keep-me");
		expect(finalized.longRunningToolIds?.has(calls[0].id!)).toBe(true);
		expect(finalized.longRunningToolIds?.has("keep-me")).toBe(false);
	});
});

describe("BaseLlmFlow._postprocessLive", () => {
	it("yields nothing when response has no content/error/interrupt/turnComplete", async () => {
		const flow = new InspectableFlow();
		const events = await collect(
			flow._postprocessLive(
				makeCtx(),
				new LlmRequest(),
				{} as LlmResponse,
				new Event({ author: "agent" }),
			),
		);
		expect(events).toEqual([]);
	});

	it("yields finalized event for turnComplete without content", async () => {
		const flow = new InspectableFlow();
		const events = await collect(
			flow._postprocessLive(
				makeCtx({ agent: { name: "live-agent" } }),
				new LlmRequest(),
				{ turnComplete: true } as unknown as LlmResponse,
				new Event({
					id: "live-1",
					author: "live-agent",
					invocationId: "inv",
				}),
			),
		);
		expect(events).toHaveLength(1);
		expect(events[0].author).toBe("live-agent");
	});

	it("runs tools and transfers via runLive when transferToAgent is set", async () => {
		const flow = new InspectableFlow();
		const transferEvent = new Event({
			author: "child",
			content: { parts: [{ text: "from-child" }] },
		});
		const child = {
			name: "child",
			runLive: vi.fn(async function* () {
				yield transferEvent;
			}),
			runAsync: vi.fn(async function* () {
				yield new Event({ author: "child-async" });
			}),
		};
		const findAgent = vi.fn((name: string) =>
			name === "child" ? child : undefined,
		);
		const transferTool = new FlowTool(
			{ name: "transfer_to_agent", description: "transfer" },
			async (args, context) => {
				context.actions.transferToAgent = String(args.agent_name);
				return { transferred: true };
			},
		);
		const llmRequest = new LlmRequest();
		llmRequest.toolsDict = { transfer_to_agent: transferTool };

		const ctx = llmAgentCtx({
			name: "parent",
			rootAgent: { name: "root", findAgent },
		});

		const events = await collect(
			flow._postprocessLive(
				ctx,
				llmRequest,
				{
					content: {
						role: "model",
						parts: [
							{
								functionCall: {
									name: "transfer_to_agent",
									id: "fc-1",
									args: { agent_name: "child" },
								},
							},
						],
					},
				} as LlmResponse,
				new Event({ id: "m1", author: "parent", invocationId: "inv" }),
			),
		);

		expect(events.length).toBeGreaterThanOrEqual(3);
		expect(events.some((e) => e === transferEvent)).toBe(true);
		expect(findAgent).toHaveBeenCalledWith("child");
		expect(child.runLive).toHaveBeenCalled();
		expect(child.runAsync).not.toHaveBeenCalled();
	});

	it("falls back to runAsync when runLive is missing on transfer target", async () => {
		const flow = new InspectableFlow();
		const childEvent = new Event({ author: "child" });
		const child = {
			name: "child",
			runAsync: vi.fn(async function* () {
				yield childEvent;
			}),
		};
		const findAgent = vi.fn(() => child);
		const transferTool = new FlowTool(
			{ name: "transfer_to_agent", description: "transfer" },
			async (_args, context) => {
				context.actions.transferToAgent = "child";
				return { ok: true };
			},
		);
		const llmRequest = new LlmRequest();
		llmRequest.toolsDict = { transfer_to_agent: transferTool };
		const ctx = llmAgentCtx({
			name: "parent",
			rootAgent: { name: "root", findAgent },
		});

		const events = await collect(
			flow._postprocessLive(
				ctx,
				llmRequest,
				{
					content: {
						role: "model",
						parts: [
							{
								functionCall: {
									name: "transfer_to_agent",
									id: "fc-2",
									args: {},
								},
							},
						],
					},
				} as LlmResponse,
				new Event({ id: "m2", author: "parent", invocationId: "inv" }),
			),
		);

		expect(events.some((e) => e === childEvent)).toBe(true);
		expect(child.runAsync).toHaveBeenCalled();
	});
});

describe("BaseLlmFlow._postprocessHandleFunctionCallsAsync", () => {
	it("yields auth event before function response when auth is requested", async () => {
		const flow = new InspectableFlow();
		const authTool = new FlowTool(
			{ name: "secure_tool", description: "needs auth" },
			async (_args, context) => {
				context.actions.requestedAuthConfigs = {
					[context.functionCallId!]: { authScheme: { type: "oauth2" } },
				};
				return { pending: true };
			},
		);
		const llmRequest = new LlmRequest();
		llmRequest.toolsDict = { secure_tool: authTool };
		const ctx = llmAgentCtx();
		const functionCallEvent = new Event({
			author: "llm-agent",
			invocationId: "inv",
			content: {
				role: "model",
				parts: [
					{ functionCall: { name: "secure_tool", id: "auth-1", args: {} } },
				],
			},
		});

		const events = await collect(
			flow._postprocessHandleFunctionCallsAsync(
				ctx,
				functionCallEvent,
				llmRequest,
			),
		);

		expect(events).toHaveLength(2);
		expect(events[0].getFunctionCalls()[0]?.name).toBe(
			"adk_request_credential",
		);
		expect(events[1].getFunctionResponses()[0]?.name).toBe("secure_tool");
	});

	it("transfers to another agent via runAsync after tool response", async () => {
		const flow = new InspectableFlow();
		const childEvent = new Event({
			author: "helper",
			content: { parts: [{ text: "helped" }] },
		});
		const helper = {
			name: "helper",
			runAsync: vi.fn(async function* () {
				yield childEvent;
			}),
		};
		const findAgent = vi.fn((name: string) =>
			name === "helper" ? helper : undefined,
		);
		const transferTool = new FlowTool(
			{ name: "transfer_to_agent", description: "transfer" },
			async (_args, context) => {
				context.actions.transferToAgent = "helper";
				return { ok: true };
			},
		);
		const llmRequest = new LlmRequest();
		llmRequest.toolsDict = { transfer_to_agent: transferTool };
		const ctx = llmAgentCtx({
			rootAgent: { name: "root", findAgent },
		});
		const functionCallEvent = new Event({
			author: "llm-agent",
			invocationId: "inv",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							name: "transfer_to_agent",
							id: "t-1",
							args: { agent_name: "helper" },
						},
					},
				],
			},
		});

		const events = await collect(
			flow._postprocessHandleFunctionCallsAsync(
				ctx,
				functionCallEvent,
				llmRequest,
			),
		);

		expect(events.some((e) => e.getFunctionResponses().length > 0)).toBe(true);
		expect(events.some((e) => e === childEvent)).toBe(true);
		expect(helper.runAsync).toHaveBeenCalled();
	});

	it("yields nothing when tools produce no response events", async () => {
		const flow = new InspectableFlow();
		const longRunning = new FlowTool(
			{
				name: "slow",
				description: "long running",
				isLongRunning: true,
			},
			async () => null,
		);
		const llmRequest = new LlmRequest();
		llmRequest.toolsDict = { slow: longRunning };
		const ctx = llmAgentCtx();
		const functionCallEvent = new Event({
			author: "llm-agent",
			invocationId: "inv",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "slow", id: "lr-1", args: {} } }],
			},
		});

		const events = await collect(
			flow._postprocessHandleFunctionCallsAsync(
				ctx,
				functionCallEvent,
				llmRequest,
			),
		);
		expect(events).toEqual([]);
	});
});

describe("BaseLlmFlow._postprocessAsync with function calls", () => {
	it("finalizes FC ids then handles tools through postprocess", async () => {
		const flow = new InspectableFlow();
		const echo = new FlowTool(
			{ name: "echo", description: "echo" },
			async (args) => ({ echoed: args.value }),
		);
		const llmRequest = new LlmRequest();
		llmRequest.toolsDict = { echo };
		const ctx = llmAgentCtx();
		const modelEvent = new Event({
			id: "m-fc",
			author: "llm-agent",
			invocationId: "inv",
			actions: new EventActions(),
		});

		const events = await collect(
			flow._postprocessAsync(
				ctx,
				llmRequest,
				{
					content: {
						role: "model",
						parts: [
							{
								functionCall: {
									name: "echo",
									args: { value: "hi" },
								},
							},
						],
					},
				} as LlmResponse,
				modelEvent,
			),
		);

		expect(events.length).toBeGreaterThanOrEqual(2);
		const modelEvt = events[0];
		expect(modelEvt.getFunctionCalls()[0].id?.startsWith("adk-")).toBe(true);
		expect(events[1].getFunctionResponses()[0]).toMatchObject({
			name: "echo",
			response: { echoed: "hi" },
		});
	});

	it("yields response processor events before model event", async () => {
		const flow = new InspectableFlow();
		const processorEvent = new Event({ author: "processor" });
		flow.responseProcessors = [
			{
				runAsync: async function* () {
					yield processorEvent;
				},
			},
		];

		const events = await collect(
			flow._postprocessAsync(
				makeCtx({ agent: { name: "agent" } }),
				new LlmRequest(),
				{ content: { role: "model", parts: [{ text: "hi" }] } } as LlmResponse,
				new Event({ id: "e1", author: "agent", invocationId: "inv" }),
			),
		);

		expect(events[0]).toBe(processorEvent);
		expect(events[1].content?.parts?.[0]).toEqual({ text: "hi" });
	});
});
