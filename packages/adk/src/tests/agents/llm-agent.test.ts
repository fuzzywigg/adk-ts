import { describe, it, expect, vi, beforeEach } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";
import type { InvocationContext } from "../../agents/invocation-context";
import { AutoFlow, SingleFlow } from "../../flows/llm-flows";
import { FunctionTool } from "../../tools/function/function-tool";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

vi.mock("../../flows/llm-flows", () => ({
	SingleFlow: vi.fn(function () {
		this.runAsync = vi.fn();
	}),
	AutoFlow: vi.fn(function () {
		this.runAsync = vi.fn();
	}),
}));

const mockContext: InvocationContext = {
	invocationId: "test-inv-id",
	agent: {} as any,
	branch: [],
	session: {
		id: "ses-123",
		userId: "user-123",
		appName: "test-app",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	createChildContext: vi.fn(),
} as unknown as InvocationContext;

describe("LlmAgent (Run Logic)", () => {
	let agent: LlmAgent;

	beforeEach(() => {
		vi.clearAllMocks();
		agent = new LlmAgent({
			name: "testAgent",
			description: "A test agent",
		});
	});

	describe("maybeSaveOutputToState", () => {
		it("should do nothing if outputKey is not set", () => {
			const event = new Event({ author: agent.name });
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta).toStrictEqual({});
		});

		it("should do nothing if the event is not a final response", () => {
			agent.outputKey = "result";
			const event = new Event({ author: agent.name });
			vi.spyOn(event, "isFinalResponse").mockReturnValue(false);

			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta).toStrictEqual({});
		});

		it("should do nothing if the event has no content parts", () => {
			agent.outputKey = "result";
			const event = new Event({ content: { parts: [] }, author: agent.name });
			vi.spyOn(event, "isFinalResponse").mockReturnValue(true);

			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta).toStrictEqual({});
		});

		it("should save concatenated text to stateDelta if conditions are met", () => {
			agent.outputKey = "result";
			const event = new Event({
				content: { parts: [{ text: "Hello " }, { text: "World" }] },
				author: agent.name,
			});
			vi.spyOn(event, "isFinalResponse").mockReturnValue(true);

			agent["maybeSaveOutputToState"](event);

			expect(event.actions.stateDelta).toBeDefined();
			expect(event.actions.stateDelta?.result).toBe("Hello World");
		});

		it("should create stateDelta object if it does not exist", () => {
			agent.outputKey = "result";
			const event = new Event({
				content: { parts: [{ text: "data" }] },
				author: agent.name,
			});
			vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
			event.actions = { stateDelta: undefined, artifactDelta: undefined };

			agent["maybeSaveOutputToState"](event);

			expect(event.actions.stateDelta).toBeDefined();
			expect(event.actions.stateDelta?.result).toBe("data");
		});

		it("should not save to state if the resulting text is empty", () => {
			agent.outputKey = "result";
			const event = new Event({
				content: { parts: [{ text: "" }, { text: undefined as any }] },
				author: agent.name,
			});
			event.actions = { stateDelta: undefined, artifactDelta: undefined };
			vi.spyOn(event, "isFinalResponse").mockReturnValue(true);

			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta).toBeUndefined();
		});
	});

	describe("runAsyncImpl", () => {
		it("should process yielded content from the flow", async () => {
			const mockFlowRunAsync = async function* () {
				yield "Hello world";
			};
			(agent["llmFlow"] as any).runAsync.mockReturnValue(mockFlowRunAsync());

			const yieldedEvents = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(yieldedEvents).toHaveLength(1);
			expect(yieldedEvents[0].errorCode).toBe("AGENT_EXECUTION_ERROR");
		});

		it("should catch a non-Error object from the flow and yield a formatted error event", async () => {
			const mockFlowRunAsync = async function* () {
				yield "test";
			};
			(agent["llmFlow"] as any).runAsync.mockReturnValue(mockFlowRunAsync());

			const yieldedEvents = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(yieldedEvents).toHaveLength(1);
			const errorEvent = yieldedEvents[0];
			expect(errorEvent.author).toBe(agent.name);
		});
	});
});

describe("LlmAgent defaults and canonical helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("defaults includeContents and disallowTransfer flags", () => {
		const agent = new LlmAgent({ name: "defaultsAgent" });
		expect(agent.includeContents).toBe("default");
		expect(agent.disallowTransferToParent).toBe(false);
		expect(agent.disallowTransferToPeers).toBe(false);
	});

	it("canonicalInstruction returns string instruction without provider flag", async () => {
		const agent = new LlmAgent({
			name: "instrAgent",
			instruction: "be helpful",
		});
		await expect(agent.canonicalInstruction({} as any)).resolves.toEqual([
			"be helpful",
			false,
		]);
	});

	it("canonicalInstruction invokes instruction provider", async () => {
		const agent = new LlmAgent({
			name: "providerAgent",
			instruction: async () => "from-provider",
		});
		await expect(agent.canonicalInstruction({} as any)).resolves.toEqual([
			"from-provider",
			true,
		]);
	});

	it("canonicalTools converts a function into FunctionTool", async () => {
		const echoTool = Object.defineProperty(
			new Function(
				'/** Echoes a fixed value for agent tool resolution tests. */ return "echo";',
			),
			"name",
			{ value: "echoTool" },
		);
		const agent = new LlmAgent({
			name: "toolsAgent",
			tools: [echoTool as () => string],
		});
		const tools = await agent.canonicalTools();
		expect(tools).toHaveLength(1);
		expect(tools[0]).toBeInstanceOf(FunctionTool);
		expect(tools[0].name).toBe("echoTool");
	});

	it("canonical before/after model and tool callbacks normalize single and array", () => {
		const beforeModel = vi.fn();
		const afterModel = vi.fn();
		const beforeTool = vi.fn();
		const afterTool = vi.fn();

		const single = new LlmAgent({
			name: "cbSingle",
			beforeModelCallback: beforeModel,
			afterModelCallback: afterModel,
			beforeToolCallback: beforeTool,
			afterToolCallback: afterTool,
		});
		expect(single.canonicalBeforeModelCallbacks).toEqual([beforeModel]);
		expect(single.canonicalAfterModelCallbacks).toEqual([afterModel]);
		expect(single.canonicalBeforeToolCallbacks).toEqual([beforeTool]);
		expect(single.canonicalAfterToolCallbacks).toEqual([afterTool]);

		const multi = new LlmAgent({
			name: "cbMulti",
			beforeModelCallback: [beforeModel, beforeModel],
			afterModelCallback: [afterModel],
			beforeToolCallback: [beforeTool, beforeTool],
			afterToolCallback: [afterTool, afterTool],
		});
		expect(multi.canonicalBeforeModelCallbacks).toHaveLength(2);
		expect(multi.canonicalAfterModelCallbacks).toHaveLength(1);
		expect(multi.canonicalBeforeToolCallbacks).toHaveLength(2);
		expect(multi.canonicalAfterToolCallbacks).toHaveLength(2);

		const empty = new LlmAgent({ name: "cbEmpty" });
		expect(empty.canonicalBeforeModelCallbacks).toEqual([]);
		expect(empty.canonicalAfterModelCallbacks).toEqual([]);
		expect(empty.canonicalBeforeToolCallbacks).toEqual([]);
		expect(empty.canonicalAfterToolCallbacks).toEqual([]);
	});

	it("llmFlow uses SingleFlow when both transfers are disallowed and there are no subAgents", () => {
		const agent = new LlmAgent({
			name: "singleFlowAgent",
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
		});
		void (agent as any).llmFlow;
		expect(SingleFlow).toHaveBeenCalled();
		expect(AutoFlow).not.toHaveBeenCalled();
	});

	it("llmFlow uses AutoFlow when transfers are allowed", () => {
		const agent = new LlmAgent({ name: "autoFlowAgent" });
		void (agent as any).llmFlow;
		expect(AutoFlow).toHaveBeenCalled();
		expect(SingleFlow).not.toHaveBeenCalled();
	});

	it("llmFlow uses AutoFlow when subAgents are present even if transfers are disallowed", () => {
		const child = new LlmAgent({ name: "child" });
		const agent = new LlmAgent({
			name: "parentWithSubs",
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
			subAgents: [child],
		});
		void (agent as any).llmFlow;
		expect(AutoFlow).toHaveBeenCalled();
		expect(SingleFlow).not.toHaveBeenCalled();
	});
});
