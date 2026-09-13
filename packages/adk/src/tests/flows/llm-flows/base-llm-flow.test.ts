import { describe, it, expect, vi, beforeEach } from "vitest";
import { Event } from "@adk/events";
import type { InvocationContext } from "@adk/agents";
import type { BaseAgent } from "@adk/agents";
import { SingleFlow } from "@adk/flows";
import { LlmRequest } from "@adk/models";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

class TestLlmFlow extends SingleFlow {
	public _runOneStepAsync = vi.fn();
}

class OpenLlmFlow extends SingleFlow {}

const mockAgent = {
	name: "test-agent",
} as BaseAgent;

const mockContext = {
	invocationId: "test-inv-123",
	agent: mockAgent,
	branch: "test-branch",
	endInvocation: false,
} as InvocationContext;

async function collectAsync<T>(gen: AsyncGenerator<T>): Promise<T[]> {
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
		const flow = new OpenLlmFlow();
		const finalEvent = new Event({ author: "agent" });
		vi.spyOn(finalEvent, "isFinalResponse").mockReturnValue(true);
		const runAsync = vi
			.spyOn(flow, "runAsync")
			.mockImplementation(async function* () {
				yield finalEvent;
			});

		const events = await collectAsync(flow.runLive(mockContext));
		expect(runAsync).toHaveBeenCalledWith(mockContext);
		expect(events).toEqual([finalEvent]);
	});
});

describe("BaseLlmFlow._runOneStepAsync", () => {
	it("stops after preprocess when endInvocation is set", async () => {
		const flow = new OpenLlmFlow();
		const preprocessEvent = new Event({ author: "preprocessor" });
		const context = {
			...mockContext,
			endInvocation: false,
		} as InvocationContext;

		vi.spyOn(flow, "_preprocessAsync").mockImplementation(async function* () {
			context.endInvocation = true;
			yield preprocessEvent;
		});
		const callLlm = vi.spyOn(flow, "_callLlmAsync");

		const events = await collectAsync(flow._runOneStepAsync(context));
		expect(events).toEqual([preprocessEvent]);
		expect(callLlm).not.toHaveBeenCalled();
	});
});

describe("BaseLlmFlow._preprocessAsync", () => {
	it("returns immediately when agent has no canonicalTools", async () => {
		const flow = new OpenLlmFlow();
		const processor = {
			runAsync: vi.fn(async function* () {
				yield new Event({ author: "processor" });
			}),
		};
		flow.requestProcessors = [processor];

		const events = await collectAsync(
			flow._preprocessAsync(mockContext, new LlmRequest()),
		);
		expect(events).toEqual([]);
		expect(processor.runAsync).not.toHaveBeenCalled();
	});

	it("deduplicates tools by name before processLlmRequest", async () => {
		const flow = new OpenLlmFlow();
		flow.requestProcessors = [];
		const processA = vi.fn().mockResolvedValue(undefined);
		const processDup = vi.fn().mockResolvedValue(undefined);
		const processB = vi.fn().mockResolvedValue(undefined);
		const agent = {
			name: "tools-agent",
			canonicalTools: vi.fn().mockResolvedValue([
				{ name: "a", description: "first", processLlmRequest: processA },
				{ name: "a", description: "dup", processLlmRequest: processDup },
				{ name: "b", description: "second", processLlmRequest: processB },
				{ description: "nameless", processLlmRequest: vi.fn() },
			]),
		};
		const context = {
			...mockContext,
			agent,
			session: { state: {}, events: [] },
		} as unknown as InvocationContext;

		await collectAsync(flow._preprocessAsync(context, new LlmRequest()));

		expect(processA).toHaveBeenCalledTimes(1);
		expect(processDup).not.toHaveBeenCalled();
		expect(processB).toHaveBeenCalledTimes(1);
	});
});

describe("BaseLlmFlow._postprocessAsync", () => {
	it("returns without yielding a model event when response is empty", async () => {
		const flow = new OpenLlmFlow();
		const modelEvent = new Event({
			author: "test-agent",
			invocationId: "test-inv-123",
		});

		const events = await collectAsync(
			flow._postprocessAsync(
				mockContext,
				new LlmRequest(),
				{} as never,
				modelEvent,
			),
		);

		expect(events).toEqual([]);
	});

	it("yields processor events even when model response is empty", async () => {
		const flow = new OpenLlmFlow();
		const processorEvent = new Event({ author: "response-processor" });
		flow.responseProcessors = [
			{
				runAsync: async function* () {
					yield processorEvent;
				},
			},
		];

		const events = await collectAsync(
			flow._postprocessAsync(
				mockContext,
				new LlmRequest(),
				{} as never,
				new Event({ author: "test-agent" }),
			),
		);

		expect(events).toEqual([processorEvent]);
	});
});

describe("BaseLlmFlow._getAgentToRun", () => {
	it("throws when the agent is not found in the tree", () => {
		const flow = new OpenLlmFlow();
		const context = {
			...mockContext,
			agent: {
				name: "root",
				rootAgent: {
					findAgent: vi.fn().mockReturnValue(null),
				},
			},
		} as unknown as InvocationContext;

		expect(() => flow._getAgentToRun(context, "missing")).toThrow(
			"Agent missing not found in the agent tree.",
		);
	});

	it("returns the matching agent from the root tree", () => {
		const flow = new OpenLlmFlow();
		const helper = { name: "helper" };
		const context = {
			...mockContext,
			agent: {
				name: "root",
				rootAgent: {
					findAgent: vi.fn().mockReturnValue(helper),
				},
			},
		} as unknown as InvocationContext;

		expect(flow._getAgentToRun(context, "helper")).toBe(helper);
	});
});
