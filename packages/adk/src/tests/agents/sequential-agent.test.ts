import { describe, it, expect, vi, beforeEach } from "vitest";
import { SequentialAgent } from "../../agents/sequential-agent";
import { BaseAgent } from "../../agents/base-agent";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";
import type { InvocationContext } from "../../agents/invocation-context";

class MockSubAgent extends BaseAgent {
	runAsync = vi.fn();
	runLive = vi.fn();

	constructor(name: string) {
		super({ name, description: "" });
	}
}

const mockContext: InvocationContext = {
	invocationId: "test-inv-id",
	agent: {} as any,
	branch: undefined,
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

describe("SequentialAgent", () => {
	let subAgent1: MockSubAgent;
	let subAgent2: MockSubAgent;

	beforeEach(() => {
		vi.clearAllMocks();
		subAgent1 = new MockSubAgent("subAgent1");
		subAgent2 = new MockSubAgent("subAgent2");
	});

	describe("Constructor", () => {
		it("should initialize properties correctly from config", () => {
			const agent = new SequentialAgent({
				name: "seq",
				description: "A sequential agent",
				subAgents: [subAgent1, subAgent2],
			});

			expect(agent.name).toBe("seq");
			expect(agent.description).toBe("A sequential agent");
			expect(agent.subAgents).toEqual([subAgent1, subAgent2]);
		});
	});

	describe("runAsyncImpl", () => {
		it("should run subagents in order and yield their events", async () => {
			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [subAgent1, subAgent2],
			});

			const event1 = new Event({ author: "subAgent1" });
			const event2 = new Event({ author: "subAgent2" });

			subAgent1.runAsync.mockImplementation(async function* () {
				yield event1;
			});
			subAgent2.runAsync.mockImplementation(async function* () {
				yield event2;
			});

			const yieldedEvents: Event[] = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(subAgent1.runAsync).toHaveBeenCalledTimes(1);
			expect(subAgent2.runAsync).toHaveBeenCalledTimes(1);
			expect(subAgent1.runAsync.mock.invocationCallOrder[0]).toBeLessThan(
				subAgent2.runAsync.mock.invocationCallOrder[0],
			);
			expect(yieldedEvents).toEqual([event1, event2]);
		});

		it("should handle an empty subAgents array gracefully", async () => {
			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [],
			});

			const yieldedEvents: Event[] = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(yieldedEvents).toHaveLength(0);
		});
	});

	describe("runLiveImpl", () => {
		it("should add taskCompleted tool to LlmAgent and yield live events", async () => {
			const llmAgent = new LlmAgent({
				name: "llmSub",
				description: "llm sub agent",
				instruction: "Follow the user request.",
				tools: [],
			});
			const liveEvent = new Event({ author: "llmSub" });
			llmAgent.runLive = vi.fn().mockImplementation(async function* () {
				yield liveEvent;
			});

			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [llmAgent],
			});

			const yieldedEvents: Event[] = [];
			for await (const event of agent["runLiveImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			const toolNames = llmAgent.tools.map((tool) =>
				typeof tool === "function" ? tool.name : tool.name,
			);
			expect(toolNames).toContain("taskCompleted");
			expect(llmAgent.instruction).toContain("taskCompleted");
			expect(llmAgent.runLive).toHaveBeenCalledWith(mockContext);
			expect(yieldedEvents).toEqual([liveEvent]);
		});

		it("should not duplicate taskCompleted when already present", async () => {
			function taskCompleted(): string {
				return "Task completion signaled.";
			}

			const llmAgent = new LlmAgent({
				name: "llmSub",
				description: "llm sub agent",
				instruction: "Already set.",
				tools: [taskCompleted],
			});
			llmAgent.runLive = vi.fn().mockImplementation(async function* () {
				yield new Event({ author: "llmSub" });
			});

			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [llmAgent],
			});

			for await (const _ of agent["runLiveImpl"](mockContext)) {
			}

			expect(llmAgent.tools).toHaveLength(1);
			expect(llmAgent.instruction).toBe("Already set.");
		});

		it("skips taskCompleted injection for non-LlmAgent sub-agents", async () => {
			const plain = new MockSubAgent("plain");
			plain.runLive.mockImplementation(async function* () {
				yield new Event({ author: "plain" });
			});
			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [plain],
			});

			const events: Event[] = [];
			for await (const event of agent["runLiveImpl"](mockContext)) {
				events.push(event);
			}

			expect(events).toHaveLength(1);
			expect(plain.runLive).toHaveBeenCalledWith(mockContext);
		});

		it("dedupes taskCompleted when tool is a BaseTool-like object", async () => {
			const llmAgent = new LlmAgent({
				name: "llmSub",
				description: "llm",
				instruction: "Stay.",
				tools: [{ name: "taskCompleted", runAsync: async () => "x" } as any],
			});
			llmAgent.runLive = vi.fn().mockImplementation(async function* () {
				yield new Event({ author: "llmSub" });
			});
			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [llmAgent],
			});

			for await (const _ of agent["runLiveImpl"](mockContext)) {
			}

			expect(llmAgent.tools).toHaveLength(1);
			expect(llmAgent.instruction).toBe("Stay.");
		});

		it("injects taskCompleted once across mixed Llm and non-Llm sub-agents", async () => {
			const llmAgent = new LlmAgent({
				name: "llmSub",
				description: "llm",
				instruction: "Do work.",
				tools: [],
			});
			llmAgent.runLive = vi.fn().mockImplementation(async function* () {
				yield new Event({ author: "llmSub" });
			});
			const plain = new MockSubAgent("plain");
			plain.runLive.mockImplementation(async function* () {
				yield new Event({ author: "plain" });
			});

			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [plain, llmAgent],
			});

			const events: Event[] = [];
			for await (const event of agent["runLiveImpl"](mockContext)) {
				events.push(event);
			}

			expect(events.map((e) => e.author)).toEqual(["plain", "llmSub"]);
			expect(llmAgent.tools).toHaveLength(1);
			expect(typeof llmAgent.tools[0]).toBe("function");
			const taskCompletedFn = llmAgent.tools[0] as () => string;
			expect(taskCompletedFn.name).toBe("taskCompleted");
			expect(taskCompletedFn()).toBe("Task completion signaled.");
		});

		it("runs live sub-agents in declaration order", async () => {
			const a = new MockSubAgent("a");
			const b = new MockSubAgent("b");
			const order: string[] = [];
			a.runLive.mockImplementation(async function* () {
				order.push("a");
				yield new Event({ author: "a" });
			});
			b.runLive.mockImplementation(async function* () {
				order.push("b");
				yield new Event({ author: "b" });
			});

			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [a, b],
			});

			for await (const _ of agent["runLiveImpl"](mockContext)) {
			}

			expect(order).toEqual(["a", "b"]);
		});
	});

	describe("runAsyncImpl additional edges", () => {
		it("yields multiple events from each sub-agent before moving on", async () => {
			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [subAgent1, subAgent2],
			});
			const e1a = new Event({ author: "subAgent1", id: "1a" } as any);
			const e1b = new Event({ author: "subAgent1", id: "1b" } as any);
			const e2 = new Event({ author: "subAgent2", id: "2" } as any);

			subAgent1.runAsync.mockImplementation(async function* () {
				yield e1a;
				yield e1b;
			});
			subAgent2.runAsync.mockImplementation(async function* () {
				yield e2;
			});

			const yielded: Event[] = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yielded.push(event);
			}

			expect(yielded).toEqual([e1a, e1b, e2]);
		});

		it("defaults subAgents to empty when omitted from config", () => {
			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
			});
			expect(agent.subAgents).toEqual([]);
		});
	});
});
