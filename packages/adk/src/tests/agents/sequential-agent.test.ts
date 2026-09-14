import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { LlmAgent } from "../../agents/llm-agent";
import { SequentialAgent } from "../../agents/sequential-agent";
import { Event } from "../../events/event";
import { BaseTool } from "../../tools/base/base-tool";
import type { ToolContext } from "../../tools/tool-context";

class MockSubAgent extends BaseAgent {
	runAsync = vi.fn();
	runLive = vi.fn();

	constructor(name: string) {
		super({ name, description: "" });
	}
}

class TaskCompletedTool extends BaseTool {
	constructor() {
		super({
			name: "taskCompleted",
			description: "Signals task completion",
		});
	}

	getDeclaration() {
		return { name: this.name, description: this.description };
	}

	async runAsync(_args: Record<string, any>, _context: ToolContext) {
		return { ok: true };
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

		it("skips taskCompleted injection for non-LlmAgent sub-agents but still runs them", async () => {
			const liveEvent = new Event({ author: "subAgent1" });
			subAgent1.runLive.mockImplementation(async function* () {
				yield liveEvent;
			});

			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [subAgent1],
			});

			const yieldedEvents: Event[] = [];
			for await (const event of agent["runLiveImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(subAgent1.runLive).toHaveBeenCalledWith(mockContext);
			expect(yieldedEvents).toEqual([liveEvent]);
		});

		it("dedupes taskCompleted when a BaseTool already uses that name", async () => {
			const existing = new TaskCompletedTool();
			const llmAgent = new LlmAgent({
				name: "llmSub",
				description: "llm sub agent",
				instruction: "Keep this instruction.",
				tools: [existing],
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
			expect(llmAgent.tools[0]).toBe(existing);
			expect(llmAgent.instruction).toBe("Keep this instruction.");
		});

		it("appends taskCompleted instructions to a non-empty instruction string", async () => {
			const llmAgent = new LlmAgent({
				name: "llmSub",
				description: "llm sub agent",
				instruction: "Base instruction.",
				tools: [],
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

			expect(llmAgent.instruction.startsWith("Base instruction.")).toBe(true);
			expect(llmAgent.instruction).toContain("taskCompleted");
			expect(llmAgent.tools).toHaveLength(1);
		});

		it("injects taskCompleted once per LlmAgent child across multiple children", async () => {
			const llmA = new LlmAgent({
				name: "llmA",
				description: "a",
				instruction: "A",
				tools: [],
			});
			const llmB = new LlmAgent({
				name: "llmB",
				description: "b",
				instruction: "B",
				tools: [],
			});
			llmA.runLive = vi.fn().mockImplementation(async function* () {
				yield new Event({ author: "llmA" });
			});
			llmB.runLive = vi.fn().mockImplementation(async function* () {
				yield new Event({ author: "llmB" });
			});

			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [llmA, llmB],
			});

			const yieldedEvents: Event[] = [];
			for await (const event of agent["runLiveImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(llmA.tools).toHaveLength(1);
			expect(llmB.tools).toHaveLength(1);
			expect(llmA.instruction).toContain("taskCompleted");
			expect(llmB.instruction).toContain("taskCompleted");
			expect(yieldedEvents.map((e) => e.author)).toEqual(["llmA", "llmB"]);
		});
	});

	describe("runAsyncImpl extras", () => {
		it("preserves ordering across three or more agents", async () => {
			const subAgent3 = new MockSubAgent("subAgent3");
			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [subAgent1, subAgent2, subAgent3],
			});
			const e1 = new Event({ author: "subAgent1" });
			const e2 = new Event({ author: "subAgent2" });
			const e3 = new Event({ author: "subAgent3" });

			subAgent1.runAsync.mockImplementation(async function* () {
				yield e1;
			});
			subAgent2.runAsync.mockImplementation(async function* () {
				yield e2;
			});
			subAgent3.runAsync.mockImplementation(async function* () {
				yield e3;
			});

			const yieldedEvents: Event[] = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(yieldedEvents).toEqual([e1, e2, e3]);
			expect(subAgent1.runAsync.mock.invocationCallOrder[0]).toBeLessThan(
				subAgent2.runAsync.mock.invocationCallOrder[0],
			);
			expect(subAgent2.runAsync.mock.invocationCallOrder[0]).toBeLessThan(
				subAgent3.runAsync.mock.invocationCallOrder[0],
			);
		});

		it("continues to later agents when a middle agent yields no events", async () => {
			const agent = new SequentialAgent({
				name: "seq",
				description: "desc",
				subAgents: [subAgent1, subAgent2],
			});
			const e2 = new Event({ author: "subAgent2" });
			subAgent1.runAsync.mockImplementation(async function* () {});
			subAgent2.runAsync.mockImplementation(async function* () {
				yield e2;
			});

			const yieldedEvents: Event[] = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(subAgent1.runAsync).toHaveBeenCalledTimes(1);
			expect(subAgent2.runAsync).toHaveBeenCalledTimes(1);
			expect(yieldedEvents).toEqual([e2]);
		});
	});
});
