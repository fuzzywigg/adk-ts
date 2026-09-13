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

		it("forwards non-LlmAgent subagents without injecting taskCompleted", async () => {
			const plain = new MockSubAgent("plain");
			const liveEvent = new Event({ author: "plain" });
			plain.runLive.mockImplementation(async function* () {
				yield liveEvent;
			});

			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [plain],
			});

			const yielded: Event[] = [];
			for await (const event of agent["runLiveImpl"](mockContext)) {
				yielded.push(event);
			}

			expect(plain.runLive).toHaveBeenCalledWith(mockContext);
			expect(yielded).toEqual([liveEvent]);
		});
	});
});
