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
		invocationId: "lg-heavy-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-heavy",
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

describe("LangGraphAgent heavy matrix leftover edges", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	describe("constructor validation matrix", () => {
		it("throws on duplicate node name", () => {
			const agent = new MockAgent("dup");
			expect(
				() =>
					new LangGraphAgent({
						name: "dup_graph",
						description: "d",
						nodes: [
							{ name: "dup", agent, targets: [] },
							{ name: "dup", agent, targets: [] },
						],
						rootNode: "dup",
					}),
			).toThrow(/Duplicate node name/);
		});

		it("throws when root node missing from nodes", () => {
			const agent = new MockAgent("only");
			expect(
				() =>
					new LangGraphAgent({
						name: "bad_root",
						description: "d",
						nodes: [{ name: "only", agent, targets: [] }],
						rootNode: "ghost",
					}),
			).toThrow(/Root node "ghost" not found/);
		});

		it("throws when target references non-existent node", () => {
			const a = new MockAgent("a");
			expect(
				() =>
					new LangGraphAgent({
						name: "bad_target",
						description: "d",
						nodes: [{ name: "a", agent: a, targets: ["missing"] }],
						rootNode: "a",
					}),
			).toThrow(/targets non-existent node "missing"/);
		});
	});

	describe("maxSteps matrix", () => {
		it.each([
			{ input: undefined, expected: 50 },
			{ input: 0, expected: 50 },
			{ input: 2, expected: 2 },
			{ input: 100, expected: 100 },
		])("maxSteps input $input → $expected", ({ input, expected }) => {
			const agent = new MockAgent("step");
			const config: ConstructorParameters<typeof LangGraphAgent>[0] = {
				name: "steps",
				description: "d",
				nodes: [{ name: "step", agent, targets: [] }],
				rootNode: "step",
			};
			if (input !== undefined) {
				config.maxSteps = input;
			}
			expect(new LangGraphAgent(config).getMaxSteps()).toBe(expected);
		});

		it("setMaxSteps rejects non-positive and accepts positive", () => {
			const agent = new MockAgent("bounded");
			const graph = new LangGraphAgent({
				name: "set_steps",
				description: "d",
				nodes: [{ name: "bounded", agent, targets: [] }],
				rootNode: "bounded",
				maxSteps: 10,
			});
			expect(() => graph.setMaxSteps(0)).toThrow(
				/maxSteps must be greater than 0/,
			);
			expect(() => graph.setMaxSteps(-1)).toThrow(
				/maxSteps must be greater than 0/,
			);
			graph.setMaxSteps(4);
			expect(graph.getMaxSteps()).toBe(4);
		});

		it("stops mid-walk at maxSteps but still yields completion", async () => {
			const a = new MockAgent("a");
			const b = new MockAgent("b");
			const c = new MockAgent("c");
			const graph = new LangGraphAgent({
				name: "cap",
				description: "d",
				nodes: [
					{ name: "a", agent: a, targets: ["b"] },
					{ name: "b", agent: b, targets: ["c"] },
					{ name: "c", agent: c, targets: [] },
				],
				rootNode: "a",
				maxSteps: 2,
			});
			const events = await drainGraph(graph, mockContext);
			expect(a.executionCount).toBe(1);
			expect(b.executionCount).toBe(1);
			expect(c.executionCount).toBe(0);
			expect(events[events.length - 1].turnComplete).toBe(true);
		});
	});

	describe("condition matrix", () => {
		it.each([
			{ label: "sync false skips", condition: () => false, runs: false },
			{ label: "sync true runs", condition: () => true, runs: true },
		])("$label target", async ({ condition, runs }) => {
			const root = new MockAgent("root");
			const target = new MockAgent("target");
			const graph = new LangGraphAgent({
				name: "cond_sync",
				description: "d",
				nodes: [
					{ name: "root", agent: root, targets: ["target"] },
					{
						name: "target",
						agent: target,
						targets: [],
						condition,
					},
				],
				rootNode: "root",
			});
			await drainGraph(graph, mockContext);
			expect(target.executionCount).toBe(runs ? 1 : 0);
		});

		it("async condition true runs target", async () => {
			const root = new MockAgent("root");
			const target = new MockAgent("async_tgt");
			const graph = new LangGraphAgent({
				name: "cond_async",
				description: "d",
				nodes: [
					{ name: "root", agent: root, targets: ["async_tgt"] },
					{
						name: "async_tgt",
						agent: target,
						targets: [],
						condition: async () => true,
					},
				],
				rootNode: "root",
			});
			await drainGraph(graph, mockContext);
			expect(target.executionCount).toBe(1);
		});

		it("condition rejection surfaces as NODE_EXECUTION_ERROR", async () => {
			const root = new MockAgent("root");
			const target = new MockAgent("reject_tgt");
			const graph = new LangGraphAgent({
				name: "cond_reject",
				description: "d",
				nodes: [
					{ name: "root", agent: root, targets: ["reject_tgt"] },
					{
						name: "reject_tgt",
						agent: target,
						targets: [],
						condition: () => Promise.reject(new Error("cond-boom")),
					},
				],
				rootNode: "root",
			});
			const events = await drainGraph(graph, mockContext);
			expect(target.executionCount).toBe(0);
			expect(events.some((e) => e.errorCode === "NODE_EXECUTION_ERROR")).toBe(
				true,
			);
			expect(events.some((e) => e.errorMessage === "cond-boom")).toBe(true);
		});
	});

	describe("graph walk edges", () => {
		it("parallel fan-out executes multiple targets", async () => {
			const root = new MockAgent("root");
			const left = new MockAgent("left");
			const right = new MockAgent("right");
			const graph = new LangGraphAgent({
				name: "fanout",
				description: "d",
				nodes: [
					{ name: "root", agent: root, targets: ["left", "right"] },
					{ name: "left", agent: left, targets: [] },
					{ name: "right", agent: right, targets: [] },
				],
				rootNode: "root",
			});
			await drainGraph(graph, mockContext);
			expect(left.executionCount).toBe(1);
			expect(right.executionCount).toBe(1);
		});

		it("missing runtime target logs error and continues valid branch", async () => {
			const root = new MockAgent("src");
			const valid = new MockAgent("valid");
			const ghost = new MockAgent("ghost");
			const source: LangGraphNode = {
				name: "src",
				agent: root,
				targets: ["ghost", "valid"],
			};
			const graph = new LangGraphAgent({
				name: "missing_rt",
				description: "d",
				nodes: [
					source,
					{ name: "valid", agent: valid, targets: [] },
					{ name: "ghost", agent: ghost, targets: [] },
				],
				rootNode: "src",
			});
			(graph as { nodes: Map<string, LangGraphNode> }).nodes.delete("ghost");
			const loggerError = vi.spyOn((graph as any).logger, "error");
			await drainGraph(graph, mockContext);
			expect(loggerError).toHaveBeenCalledWith('Target node "ghost" not found');
			expect(valid.executionCount).toBe(1);
			expect(ghost.executionCount).toBe(0);
		});

		it("yield-nothing node still enqueues targets using prior lastEvent", async () => {
			const root = new MockAgent("root");
			const silent = new MockAgent("silent");
			silent.yieldNothing = true;
			const after = new MockAgent("after");
			const graph = new LangGraphAgent({
				name: "silent_node",
				description: "d",
				nodes: [
					{ name: "root", agent: root, targets: ["silent"] },
					{ name: "silent", agent: silent, targets: ["after"] },
					{ name: "after", agent: after, targets: [] },
				],
				rootNode: "root",
			});
			await drainGraph(graph, mockContext);
			expect(silent.executionCount).toBe(1);
			expect(after.executionCount).toBe(1);
		});
	});

	describe("execution history and live delegate", () => {
		it("getExecutionResults returns a copy", async () => {
			const agent = new MockAgent("hist");
			const graph = new LangGraphAgent({
				name: "history",
				description: "d",
				nodes: [{ name: "hist", agent, targets: [] }],
				rootNode: "hist",
			});
			await drainGraph(graph, mockContext);
			const first = graph.getExecutionResults();
			first.push({ node: "mutated", events: [] });
			expect(graph.getExecutionResults()).not.toEqual(first);
			expect(graph.getExecutionResults()[0].node).toBe("hist");
		});

		it("clearExecutionHistory empties results", async () => {
			const agent = new MockAgent("clear");
			const graph = new LangGraphAgent({
				name: "clear_hist",
				description: "d",
				nodes: [{ name: "clear", agent, targets: [] }],
				rootNode: "clear",
			});
			await drainGraph(graph, mockContext);
			expect(graph.getExecutionResults()).toHaveLength(1);
			graph.clearExecutionHistory();
			expect(graph.getExecutionResults()).toEqual([]);
		});

		it("runLiveImpl delegates to runAsyncImpl", async () => {
			const agent = new MockAgent("live");
			const graph = new LangGraphAgent({
				name: "live_delegate",
				description: "d",
				nodes: [{ name: "live", agent, targets: [] }],
				rootNode: "live",
			});
			const asyncSpy = vi.spyOn(graph as any, "runAsyncImpl");
			const events: Event[] = [];
			for await (const event of graph["runLiveImpl"](mockContext)) {
				events.push(event);
			}
			expect(asyncSpy).toHaveBeenCalled();
			expect(events.length).toBeGreaterThan(0);
		});
	});

	describe("NODE_EXECUTION_ERROR envelope", () => {
		it.each([
			{
				label: "Error",
				throwValue: new Error("node-err"),
				expected: "node-err",
			},
			{ label: "string", throwValue: "raw-node", expected: "raw-node" },
			{ label: "number", throwValue: 7, expected: "7" },
		])("wraps $label node throw", async ({ throwValue, expected }) => {
			const thrower = new MockAgent("thrower");
			thrower.throwValue = throwValue;
			const graph = new LangGraphAgent({
				name: "node_err",
				description: "d",
				nodes: [{ name: "thrower", agent: thrower, targets: [] }],
				rootNode: "thrower",
			});
			const events = await drainGraph(graph, mockContext);
			expect(events[0].errorCode).toBe("NODE_EXECUTION_ERROR");
			expect(events[0].errorMessage).toBe(expected);
			expect(events[0].content?.parts?.[0]?.text).toContain(expected);
		});
	});
});
