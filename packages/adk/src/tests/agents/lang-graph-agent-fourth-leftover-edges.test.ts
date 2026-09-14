import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { LangGraphAgent } from "../../agents/lang-graph-agent";
import { Event } from "../../events/event";

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
	yieldEvents: Event[] | null = null;

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
		if (this.yieldEvents) {
			for (const event of this.yieldEvents) {
				yield event;
			}
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
		invocationId: "lg-fourth-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-fourth",
			userId: "user-lg",
			appName: "lg-app",
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

async function drain(
	graph: LangGraphAgent,
	context: InvocationContext,
): Promise<Event[]> {
	const events: Event[] = [];
	for await (const event of graph["runAsyncImpl"](context)) {
		events.push(event);
	}
	return events;
}

describe("LangGraphAgent fourth leftover edges", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	it("throws on duplicate node names at construction", () => {
		const a = new MockAgent("dup");
		expect(
			() =>
				new LangGraphAgent({
					name: "dup_graph",
					description: "d",
					nodes: [
						{ name: "dup", agent: a, targets: [] },
						{ name: "dup", agent: new MockAgent("dup2"), targets: [] },
					],
					rootNode: "dup",
				}),
		).toThrow(/Duplicate node name/);
	});

	it("throws when rootNode is missing from nodes", () => {
		expect(
			() =>
				new LangGraphAgent({
					name: "bad_root",
					description: "d",
					nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
					rootNode: "missing",
				}),
		).toThrow(/Root node "missing" not found/);
	});

	it("throws when a target references a missing node during validateGraph", () => {
		expect(
			() =>
				new LangGraphAgent({
					name: "bad_target",
					description: "d",
					nodes: [
						{
							name: "src",
							agent: new MockAgent("src"),
							targets: ["nope"],
						},
					],
					rootNode: "src",
				}),
		).toThrow(/targets non-existent node "nope"/);
	});

	it("getNodes / getNode / getRootNodeName expose graph structure", () => {
		const agent = new MockAgent("n1");
		const graph = new LangGraphAgent({
			name: "struct",
			description: "d",
			nodes: [{ name: "n1", agent, targets: [] }],
			rootNode: "n1",
			maxSteps: 7,
		});
		expect(graph.getRootNodeName()).toBe("n1");
		expect(graph.getMaxSteps()).toBe(7);
		expect(graph.getNode("n1")?.agent).toBe(agent);
		expect(graph.getNode("missing")).toBeUndefined();
		expect(graph.getNodes()).toHaveLength(1);
	});

	it("setMaxSteps rejects non-positive values and accepts positives", () => {
		const graph = new LangGraphAgent({
			name: "steps",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
		});
		expect(() => graph.setMaxSteps(0)).toThrow(/greater than 0/);
		expect(() => graph.setMaxSteps(-1)).toThrow(/greater than 0/);
		graph.setMaxSteps(12);
		expect(graph.getMaxSteps()).toBe(12);
	});

	it("clearExecutionHistory empties prior results", async () => {
		const agent = new MockAgent("hist");
		const graph = new LangGraphAgent({
			name: "hist_graph",
			description: "d",
			nodes: [{ name: "hist", agent, targets: [] }],
			rootNode: "hist",
		});
		await drain(graph, mockContext);
		expect(graph.getExecutionResults()).toHaveLength(1);
		graph.clearExecutionHistory();
		expect(graph.getExecutionResults()).toEqual([]);
	});

	it("getExecutionResults returns a shallow copy", async () => {
		const agent = new MockAgent("copy");
		const graph = new LangGraphAgent({
			name: "copy_graph",
			description: "d",
			nodes: [{ name: "copy", agent, targets: [] }],
			rootNode: "copy",
		});
		await drain(graph, mockContext);
		const first = graph.getExecutionResults();
		first.pop();
		expect(graph.getExecutionResults()).toHaveLength(1);
	});

	it("yields root-not-found when rootNode is missing at runtime", async () => {
		const agent = new MockAgent("alive");
		const graph = new LangGraphAgent({
			name: "runtime_root",
			description: "d",
			nodes: [{ name: "alive", agent, targets: [] }],
			rootNode: "alive",
		});
		(graph as { rootNode: string }).rootNode = "gone";

		const events = await drain(graph, mockContext);
		expect(events[0].content?.parts?.[0]?.text).toBe(
			'Root node "gone" not found.',
		);
	});

	it("getNextNodes returns [] for terminal nodes without targets", async () => {
		const agent = new MockAgent("term");
		const graph = new LangGraphAgent({
			name: "term_graph",
			description: "d",
			nodes: [{ name: "term", agent, targets: [] }],
			rootNode: "term",
		});
		const next = await graph["getNextNodes"](
			{ name: "term", agent, targets: [] },
			new Event({ author: "term" }),
			mockContext,
		);
		expect(next).toEqual([]);
	});

	it("getNextNodes returns [] when targets is undefined", async () => {
		const agent = new MockAgent("undef_t");
		const graph = new LangGraphAgent({
			name: "undef_targets",
			description: "d",
			nodes: [{ name: "undef_t", agent }],
			rootNode: "undef_t",
		});
		const next = await graph["getNextNodes"](
			{ name: "undef_t", agent },
			new Event({ author: "undef_t" }),
			mockContext,
		);
		expect(next).toEqual([]);
	});

	it("awaits async condition functions when selecting targets", async () => {
		const root = new MockAgent("async_root");
		const yes = new MockAgent("async_yes");
		const no = new MockAgent("async_no");
		const graph = new LangGraphAgent({
			name: "async_cond",
			description: "d",
			nodes: [
				{ name: "async_root", agent: root, targets: ["async_yes", "async_no"] },
				{
					name: "async_yes",
					agent: yes,
					targets: [],
					condition: async () => true,
				},
				{
					name: "async_no",
					agent: no,
					targets: [],
					condition: async () => false,
				},
			],
			rootNode: "async_root",
		});
		await drain(graph, mockContext);
		expect(yes.executionCount).toBe(1);
		expect(no.executionCount).toBe(0);
	});

	it("does not enqueue next nodes when a node yields no events", async () => {
		const silent = new MockAgent("silent");
		silent.yieldEvents = [];
		const next = new MockAgent("never");
		const graph = new LangGraphAgent({
			name: "silent_graph",
			description: "d",
			nodes: [
				{ name: "silent", agent: silent, targets: ["never"] },
				{ name: "never", agent: next, targets: [] },
			],
			rootNode: "silent",
		});
		const events = await drain(graph, mockContext);
		expect(next.executionCount).toBe(0);
		expect(events.at(-1)?.turnComplete).toBe(true);
		expect(events.at(-1)?.content?.parts?.[0]?.text).toContain("silent");
	});

	it("wraps Error throws with message in NODE_EXECUTION_ERROR", async () => {
		const boom = new MockAgent("boom");
		boom.throwValue = new Error("node exploded");
		const graph = new LangGraphAgent({
			name: "err_graph",
			description: "d",
			nodes: [{ name: "boom", agent: boom, targets: [] }],
			rootNode: "boom",
		});
		const events = await drain(graph, mockContext);
		expect(events).toHaveLength(1);
		expect(events[0].errorCode).toBe("NODE_EXECUTION_ERROR");
		expect(events[0].errorMessage).toBe("node exploded");
	});

	it("runLiveImpl mirrors runAsyncImpl completion path", async () => {
		const agent = new MockAgent("live_node");
		const graph = new LangGraphAgent({
			name: "live_graph",
			description: "d",
			nodes: [{ name: "live_node", agent, targets: [] }],
			rootNode: "live_node",
		});
		const events: Event[] = [];
		for await (const event of graph["runLiveImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.executionCount).toBe(1);
		expect(events.at(-1)?.turnComplete).toBe(true);
	});

	it("pushes node agents into subAgents for findAgent discovery", () => {
		const a = new MockAgent("discover_a");
		const b = new MockAgent("discover_b");
		const graph = new LangGraphAgent({
			name: "discover",
			description: "d",
			nodes: [
				{ name: "discover_a", agent: a, targets: ["discover_b"] },
				{ name: "discover_b", agent: b, targets: [] },
			],
			rootNode: "discover_a",
		});
		expect(graph.subAgents).toContain(a);
		expect(graph.subAgents).toContain(b);
		expect(graph.findAgent("discover_b")).toBe(b);
	});

	it("completion event lists executed nodes with arrow separators", async () => {
		const a = new MockAgent("path_a");
		const b = new MockAgent("path_b");
		const graph = new LangGraphAgent({
			name: "path_graph",
			description: "d",
			nodes: [
				{ name: "path_a", agent: a, targets: ["path_b"] },
				{ name: "path_b", agent: b, targets: [] },
			],
			rootNode: "path_a",
		});
		const events = await drain(graph, mockContext);
		expect(events.at(-1)?.content?.parts?.[0]?.text).toBe(
			"Graph execution complete. Executed nodes: path_a → path_b",
		);
	});

	it("records per-node event arrays in execution results", async () => {
		const multi = new MockAgent("multi");
		multi.yieldEvents = [
			new Event({ author: "multi", content: { parts: [{ text: "1" }] } }),
			new Event({ author: "multi", content: { parts: [{ text: "2" }] } }),
		];
		const graph = new LangGraphAgent({
			name: "multi_events",
			description: "d",
			nodes: [{ name: "multi", agent: multi, targets: [] }],
			rootNode: "multi",
		});
		await drain(graph, mockContext);
		const results = graph.getExecutionResults();
		expect(results[0].node).toBe("multi");
		expect(results[0].events).toHaveLength(2);
	});

	it("maxSteps 1 executes only the root node", async () => {
		const root = new MockAgent("cap_root");
		const child = new MockAgent("cap_child");
		const graph = new LangGraphAgent({
			name: "cap_one",
			description: "d",
			nodes: [
				{ name: "cap_root", agent: root, targets: ["cap_child"] },
				{ name: "cap_child", agent: child, targets: [] },
			],
			rootNode: "cap_root",
			maxSteps: 1,
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(0);
	});
});
