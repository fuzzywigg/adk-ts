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

class NamedBaseTool extends BaseTool {
	constructor(name: string) {
		super({ name, description: `${name} tool` });
	}

	getDeclaration() {
		return { name: this.name, description: this.description };
	}

	async runAsync(_args: Record<string, unknown>, _context: ToolContext) {
		return { ok: true };
	}
}

const mockContext: InvocationContext = {
	invocationId: "test-inv-id",
	agent: {} as BaseAgent,
	branch: undefined,
	session: {
		id: "ses-123",
		userId: "user-123",
		appName: "test-app",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as InvocationContext["session"],
	endInvocation: false,
	createChildContext: vi.fn(),
} as unknown as InvocationContext;

describe("SequentialAgent leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("yields nothing when subAgents is empty", async () => {
		const agent = new SequentialAgent({
			name: "empty_seq",
			description: "desc",
			subAgents: [],
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("yields nothing when subAgents is omitted", async () => {
		const agent = new SequentialAgent({
			name: "omitted_seq",
			description: "desc",
		});
		expect(agent.subAgents).toEqual([]);
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("runAsyncImpl sequences sub-agents in declaration order", async () => {
		const first = new MockSubAgent("first");
		const second = new MockSubAgent("second");
		const third = new MockSubAgent("third");
		const order: string[] = [];

		first.runAsync.mockImplementation(async function* () {
			order.push("first");
			yield new Event({ author: "first" });
		});
		second.runAsync.mockImplementation(async function* () {
			order.push("second");
			yield new Event({ author: "second" });
		});
		third.runAsync.mockImplementation(async function* () {
			order.push("third");
			yield new Event({ author: "third" });
		});

		const agent = new SequentialAgent({
			name: "ordered_seq",
			description: "desc",
			subAgents: [first, second, third],
		});

		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			authors.push(event.author);
		}

		expect(order).toEqual(["first", "second", "third"]);
		expect(authors).toEqual(["first", "second", "third"]);
	});

	it("does not inject taskCompleted for non-LlmAgent sub-agents in runLiveImpl", async () => {
		const base = new MockSubAgent("base_only");
		base.runLive.mockImplementation(async function* () {
			yield new Event({ author: "base_only" });
		});

		const agent = new SequentialAgent({
			name: "mixed_seq",
			description: "desc",
			subAgents: [base],
		});

		const events: Event[] = [];
		for await (const event of agent["runLiveImpl"](mockContext)) {
			events.push(event);
		}

		expect(base.runLive).toHaveBeenCalledWith(mockContext);
		expect(events).toHaveLength(1);
	});

	it("injects taskCompleted once for LlmAgent and appends instruction", async () => {
		const llm = new LlmAgent({
			name: "llm_child",
			description: "llm",
			instruction: "Do the work.",
			tools: [],
		});
		llm.runLive = vi.fn().mockImplementation(async function* () {
			yield new Event({ author: "llm_child" });
		});

		const agent = new SequentialAgent({
			name: "live_seq",
			description: "desc",
			subAgents: [llm],
		});

		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}

		const toolNames = llm.tools.map((tool) =>
			typeof tool === "function" ? tool.name : tool.name,
		);
		expect(toolNames).toEqual(["taskCompleted"]);
		expect(llm.tools).toHaveLength(1);
		expect(llm.instruction).toContain("Do the work.");
		expect(llm.instruction).toContain("taskCompleted");
	});

	it("dedupes taskCompleted by function name when already present", async () => {
		function taskCompleted(): string {
			return "already here";
		}

		const llm = new LlmAgent({
			name: "dedup_fn",
			description: "llm",
			instruction: "unchanged",
			tools: [taskCompleted],
		});
		llm.runLive = vi.fn().mockImplementation(async function* () {
			yield new Event({ author: "dedup_fn" });
		});

		const agent = new SequentialAgent({
			name: "dedup_seq",
			description: "desc",
			subAgents: [llm],
		});

		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}

		expect(llm.tools).toHaveLength(1);
		expect(llm.instruction).toBe("unchanged");
	});

	it("dedupes taskCompleted when a BaseTool already uses that name", async () => {
		const existing = new NamedBaseTool("taskCompleted");
		const llm = new LlmAgent({
			name: "dedup_tool",
			description: "llm",
			instruction: "keep me",
			tools: [existing],
		});
		llm.runLive = vi.fn().mockImplementation(async function* () {
			yield new Event({ author: "dedup_tool" });
		});

		const agent = new SequentialAgent({
			name: "tool_dedup_seq",
			description: "desc",
			subAgents: [llm],
		});

		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}

		const toolNames = llm.tools.map((tool) =>
			typeof tool === "function" ? tool.name : tool.name,
		);
		expect(toolNames).toEqual(["taskCompleted"]);
		expect(llm.tools[0]).toBe(existing);
		expect(llm.instruction).toBe("keep me");
	});

	it("maps function tool names and BaseTool names consistently in toolNames check", async () => {
		function helperTool(): string {
			return "helper";
		}
		const baseTool = new NamedBaseTool("otherTool");

		const llm = new LlmAgent({
			name: "name_map",
			description: "llm",
			instruction: "",
			tools: [helperTool, baseTool],
		});
		llm.runLive = vi.fn().mockImplementation(async function* () {
			yield new Event({ author: "name_map" });
		});

		const agent = new SequentialAgent({
			name: "map_seq",
			description: "desc",
			subAgents: [llm],
		});

		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}

		const toolNames = llm.tools.map((tool) =>
			typeof tool === "function" ? tool.name : tool.name,
		);
		expect(toolNames).toContain("helperTool");
		expect(toolNames).toContain("otherTool");
		expect(toolNames).toContain("taskCompleted");
		expect(llm.tools).toHaveLength(3);
	});

	it("injects taskCompleted separately for each LlmAgent child", async () => {
		const llmA = new LlmAgent({
			name: "llm_a",
			description: "a",
			instruction: "A",
			tools: [],
		});
		const llmB = new LlmAgent({
			name: "llm_b",
			description: "b",
			instruction: "B",
			tools: [],
		});
		llmA.runLive = vi.fn().mockImplementation(async function* () {
			yield new Event({ author: "llm_a" });
		});
		llmB.runLive = vi.fn().mockImplementation(async function* () {
			yield new Event({ author: "llm_b" });
		});

		const agent = new SequentialAgent({
			name: "multi_llm_seq",
			description: "desc",
			subAgents: [llmA, llmB],
		});

		const authors: string[] = [];
		for await (const event of agent["runLiveImpl"](mockContext)) {
			authors.push(event.author);
		}

		expect(llmA.tools).toHaveLength(1);
		expect(llmB.tools).toHaveLength(1);
		expect(llmA.instruction).toContain("taskCompleted");
		expect(llmB.instruction).toContain("taskCompleted");
		expect(authors).toEqual(["llm_a", "llm_b"]);
	});

	it("runLiveImpl runs non-LlmAgent then LlmAgent in sequence", async () => {
		const base = new MockSubAgent("base_first");
		const llm = new LlmAgent({
			name: "llm_second",
			description: "llm",
			instruction: "",
			tools: [],
		});
		base.runLive.mockImplementation(async function* () {
			yield new Event({ author: "base_first" });
		});
		llm.runLive = vi.fn().mockImplementation(async function* () {
			yield new Event({ author: "llm_second" });
		});

		const agent = new SequentialAgent({
			name: "mixed_live_seq",
			description: "desc",
			subAgents: [base, llm],
		});

		const authors: string[] = [];
		for await (const event of agent["runLiveImpl"](mockContext)) {
			authors.push(event.author);
		}

		expect(base.runLive.mock.invocationCallOrder[0]).toBeLessThan(
			(llm.runLive as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
		);
		expect(authors).toEqual(["base_first", "llm_second"]);
		expect(llm.tools).toHaveLength(1);
	});
});
