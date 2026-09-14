import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	LangGraphAgent,
	type LangGraphNode,
} from "../../agents/lang-graph-agent";
import { BaseAgent } from "../../agents/base-agent";
import { Event } from "../../events/event";
import type { InvocationContext } from "../../agents/invocation-context";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	})),
}));

class MockAgent extends BaseAgent {
	executionCount = 0;
	throwValue: unknown;
	yieldNothing = false;
	conditionSpy?: ReturnType<typeof vi.fn>;

	constructor(name: string) {
		super({ name, description: `Mock ${name}` });
	}

	async *runAsync(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		this.executionCount++;
		if (this.throwValue !== undefined) {
			throw this.throwValue;
		}
		if (this.yieldNothing) {
			return;
		}
		yield new Event({
			author: this.name,
			content: { parts: [{ text: `from ${this.name}` }] },
		});
	}
}

function createMockContext(): InvocationContext {
	return {
		invocationId: "lg-rem-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-rem",
			userId: "user-lg-rem",
			appName: "lg-rem-app",
			state: {},
			events: [],
			lastUpdateTime: 0,
		} as InvocationContext["session"],
		endInvocation: false,
		createChildContext: vi.fn((agent) => {
			const child = createMockContext();
			child.agent = agent;
			return child;
		}),
	} as unknown as InvocationContext;
}

async function drainGraph(
	graph: LangGraphAgent,
	context: InvocationContext,
): Promise<Event[]> {
	const events: Event[] = [];
	for await (const event of graph["runAsyncImpl"](context)) {
		events.push(event);
	}
	return events;
}

describe("LangGraphAgent remainder edges (overnight TOKENMAXX post #142)", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	it("async condition Promise.resolve(false) skips target node", async () => {
		const root = new MockAgent("root");
		const skipped = new MockAgent("skipped");
		const graph = new LangGraphAgent({
			name: "async_false",
			description: "desc",
			nodes: [
				{ name: "root", agent: root, targets: ["skipped"] },
				{
					name: "skipped",
					agent: skipped,
					targets: [],
					condition: async () => false,
				},
			],
			rootNode: "root",
		});

		const events = await drainGraph(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(skipped.executionCount).toBe(0);
		expect(
			events.some(
				(e) =>
					e.turnComplete &&
					String(e.content?.parts?.[0]?.text).includes("root"),
			),
		).toBe(true);
	});

	it("condition is invoked with lastEvent and parent InvocationContext", async () => {
		const root = new MockAgent("root");
		const next = new MockAgent("next");
		const condition = vi.fn(
			async (lastEvent: Event, ctx: InvocationContext) => {
				expect(lastEvent.author).toBe("root");
				expect(ctx).toBe(mockContext);
				return true;
			},
		);

		const graph = new LangGraphAgent({
			name: "cond_args",
			description: "desc",
			nodes: [
				{ name: "root", agent: root, targets: ["next"] },
				{ name: "next", agent: next, targets: [], condition },
			],
			rootNode: "root",
		});

		await drainGraph(graph, mockContext);
		expect(condition).toHaveBeenCalledTimes(1);
		expect(next.executionCount).toBe(1);
	});

	it("failed node does not append to getExecutionResults", async () => {
		const boom = new MockAgent("boom");
		boom.throwValue = new Error("node failed");
		const graph = new LangGraphAgent({
			name: "fail_results",
			description: "desc",
			nodes: [{ name: "boom", agent: boom, targets: [] }],
			rootNode: "boom",
		});

		const events = await drainGraph(graph, mockContext);
		expect(graph.getExecutionResults()).toEqual([]);
		expect(events.some((e) => e.errorCode === "NODE_EXECUTION_ERROR")).toBe(
			true,
		);
	});

	it("node error yields error event and skips turnComplete completion", async () => {
		const boom = new MockAgent("boom");
		boom.throwValue = "string-fail";
		const graph = new LangGraphAgent({
			name: "fail_no_complete",
			description: "desc",
			nodes: [{ name: "boom", agent: boom, targets: [] }],
			rootNode: "boom",
		});

		const events = await drainGraph(graph, mockContext);
		expect(events).toHaveLength(1);
		expect(events[0].errorCode).toBe("NODE_EXECUTION_ERROR");
		expect(events[0].errorMessage).toBe("string-fail");
		expect(events[0].turnComplete).not.toBe(true);
		expect(
			events.some((e) =>
				String(e.content?.parts?.[0]?.text || "").includes(
					"Graph execution complete",
				),
			),
		).toBe(false);
	});

	it("setMaxSteps after construction bounds the next run", async () => {
		const a = new MockAgent("a");
		const b = new MockAgent("b");
		const c = new MockAgent("c");
		const graph = new LangGraphAgent({
			name: "set_max",
			description: "desc",
			nodes: [
				{ name: "a", agent: a, targets: ["b"] },
				{ name: "b", agent: b, targets: ["c"] },
				{ name: "c", agent: c, targets: [] },
			],
			rootNode: "a",
			maxSteps: 50,
		});
		graph.setMaxSteps(1);

		const events = await drainGraph(graph, mockContext);
		expect(a.executionCount).toBe(1);
		expect(b.executionCount).toBe(0);
		expect(c.executionCount).toBe(0);
		expect(
			events.some((e) =>
				String(e.content?.parts?.[0]?.text || "").includes("a"),
			),
		).toBe(true);
	});

	it("createChildContext is called with each node agent", async () => {
		const a = new MockAgent("a");
		const b = new MockAgent("b");
		const graph = new LangGraphAgent({
			name: "child_ctx",
			description: "desc",
			nodes: [
				{ name: "a", agent: a, targets: ["b"] },
				{ name: "b", agent: b, targets: [] },
			],
			rootNode: "a",
		});

		await drainGraph(graph, mockContext);
		expect(mockContext.createChildContext).toHaveBeenCalledWith(a);
		expect(mockContext.createChildContext).toHaveBeenCalledWith(b);
	});

	it("self-target cycle stops at maxSteps with turnComplete completion", async () => {
		const loop = new MockAgent("loop");
		const graph = new LangGraphAgent({
			name: "cycle",
			description: "desc",
			nodes: [{ name: "loop", agent: loop, targets: ["loop"] }],
			rootNode: "loop",
			maxSteps: 3,
		});

		const events = await drainGraph(graph, mockContext);
		expect(loop.executionCount).toBe(3);
		const completion = events.find((e) => e.turnComplete);
		expect(completion?.content?.parts?.[0]?.text).toBe(
			"Graph execution complete. Executed nodes: loop → loop → loop",
		);
	});

	it("getNextNodes returns [] for empty targets array", async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "empty_targets",
			description: "desc",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
		});

		const next = await (graph as any).getNextNodes(
			graph.getNode("only"),
			new Event({ author: "only", content: { parts: [{ text: "x" }] } }),
			mockContext,
		);
		expect(next).toEqual([]);
	});

	it("parallel fan-out queues FIFO so first target runs before second", async () => {
		const root = new MockAgent("root");
		const b = new MockAgent("B");
		const c = new MockAgent("C");
		const graph = new LangGraphAgent({
			name: "fifo",
			description: "desc",
			nodes: [
				{ name: "root", agent: root, targets: ["B", "C"] },
				{ name: "B", agent: b, targets: [] },
				{ name: "C", agent: c, targets: [] },
			],
			rootNode: "root",
		});

		const events = await drainGraph(graph, mockContext);
		const completion = events.find((e) => e.turnComplete);
		expect(completion?.content?.parts?.[0]?.text).toBe(
			"Graph execution complete. Executed nodes: root → B → C",
		);
	});

	it("root node condition is ignored because only targets are gated", async () => {
		const root = new MockAgent("root");
		const graph = new LangGraphAgent({
			name: "root_cond",
			description: "desc",
			nodes: [
				{
					name: "root",
					agent: root,
					targets: [],
					condition: () => false,
				},
			],
			rootNode: "root",
		});

		await drainGraph(graph, mockContext);
		expect(root.executionCount).toBe(1);
	});

	it("setMaxSteps rejects non-positive values", () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "bad_max",
			description: "desc",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
		});
		expect(() => graph.setMaxSteps(0)).toThrow(
			/maxSteps must be greater than 0/,
		);
		expect(() => graph.setMaxSteps(-1)).toThrow(
			/maxSteps must be greater than 0/,
		);
	});

	it("clearExecutionHistory empties prior successful results", async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "clear_hist",
			description: "desc",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
		});

		await drainGraph(graph, mockContext);
		expect(graph.getExecutionResults()).toHaveLength(1);
		graph.clearExecutionHistory();
		expect(graph.getExecutionResults()).toEqual([]);
	});

	it("getNodes/getNode/getRootNodeName expose constructed graph metadata", () => {
		const a = new MockAgent("a");
		const b = new MockAgent("b");
		const nodes: LangGraphNode[] = [
			{ name: "a", agent: a, targets: ["b"] },
			{ name: "b", agent: b, targets: [] },
		];
		const graph = new LangGraphAgent({
			name: "meta",
			description: "desc",
			nodes,
			rootNode: "a",
		});

		expect(graph.getRootNodeName()).toBe("a");
		expect(graph.getNode("b")?.agent).toBe(b);
		expect(
			graph
				.getNodes()
				.map((n) => n.name)
				.sort(),
		).toEqual(["a", "b"]);
	});

	it("runLiveImpl delegates to runAsyncImpl", async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "live",
			description: "desc",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
		});

		const events: Event[] = [];
		for await (const event of graph["runLiveImpl"](mockContext)) {
			events.push(event);
		}
		expect(only.executionCount).toBe(1);
		expect(events.some((e) => e.turnComplete)).toBe(true);
	});
});
