import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import {
	LangGraphAgent,
	type LangGraphNode,
} from "../../agents/lang-graph-agent";
import { Event } from "../../events/event";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	})),
}));

vi.mock("@adk/logger", () => ({
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
	payload = "";

	constructor(name: string, payload?: string) {
		super({ name, description: `Mock ${name}` });
		this.payload = payload ?? `from ${name}`;
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
			content: { parts: [{ text: this.payload }] },
		});
	}
}

function createMockContext(): InvocationContext {
	return {
		invocationId: "lg-matrix-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-matrix",
			userId: "user-lg-matrix",
			appName: "lg-matrix-app",
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

describe("LangGraphAgent leftover matrix edges (TOKENMAXX deepen)", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	describe("maxSteps || 50 coalesce matrix", () => {
		it.each([
			{ label: "omitted", value: undefined, expected: 50 },
			{ label: "0 → 50", value: 0, expected: 50 },
			{ label: "null → 50", value: null, expected: 50 },
			{ label: "explicit 7", value: 7, expected: 7 },
			{ label: "explicit 1", value: 1, expected: 1 },
		])("$label", ({ value, expected }) => {
			const agent = new MockAgent("steps");
			const graph = new LangGraphAgent({
				name: "steps_matrix",
				description: "desc",
				nodes: [{ name: "steps", agent, targets: [] }],
				rootNode: "steps",
				...(value === undefined ? {} : { maxSteps: value as number }),
			});
			expect(graph.getMaxSteps()).toBe(expected);
		});
	});

	describe("missing / empty targets matrix", () => {
		it("treats undefined targets as terminal in getNextNodes", async () => {
			const root = new MockAgent("term_undef");
			const node: LangGraphNode = { name: "term_undef", agent: root };
			const graph = new LangGraphAgent({
				name: "term_undef_g",
				description: "desc",
				nodes: [node],
				rootNode: "term_undef",
			});
			const next = await graph["getNextNodes"](
				node,
				new Event({ author: "term_undef" }),
				mockContext,
			);
			expect(next).toEqual([]);
		});

		it("treats empty targets array as terminal", async () => {
			const root = new MockAgent("term_empty");
			const node: LangGraphNode = {
				name: "term_empty",
				agent: root,
				targets: [],
			};
			const graph = new LangGraphAgent({
				name: "term_empty_g",
				description: "desc",
				nodes: [node],
				rootNode: "term_empty",
			});
			const next = await graph["getNextNodes"](
				node,
				new Event({ author: "term_empty" }),
				mockContext,
			);
			expect(next).toEqual([]);
		});

		it("throws at construction when a target name is missing from the graph", () => {
			const a = new MockAgent("a");
			expect(
				() =>
					new LangGraphAgent({
						name: "bad_target",
						description: "desc",
						nodes: [{ name: "a", agent: a, targets: ["missing"] }],
						rootNode: "a",
					}),
			).toThrow('Node "a" targets non-existent node "missing"');
		});

		it("logs and continues when a target disappears after construction", async () => {
			const root = new MockAgent("src");
			const keep = new MockAgent("keep");
			const ghost = new MockAgent("ghost");
			const source: LangGraphNode = {
				name: "src",
				agent: root,
				targets: ["ghost", "keep"],
			};
			const graph = new LangGraphAgent({
				name: "runtime_missing",
				description: "desc",
				nodes: [
					source,
					{ name: "ghost", agent: ghost, targets: [] },
					{ name: "keep", agent: keep, targets: [] },
				],
				rootNode: "src",
			});
			(graph as { nodes: Map<string, LangGraphNode> }).nodes.delete("ghost");
			const loggerError = vi.spyOn((graph as any).logger, "error");

			const next = await graph["getNextNodes"](
				source,
				new Event({ author: "src" }),
				mockContext,
			);
			expect(loggerError).toHaveBeenCalledWith('Target node "ghost" not found');
			expect(next.map((n) => n.name)).toEqual(["keep"]);
		});
	});

	describe("condition skip matrix", () => {
		it.each([
			{
				label: "sync false skips; sync true keeps",
				skipCond: () => false,
				keepCond: () => true,
				expectSkip: 0,
				expectKeep: 1,
			},
			{
				label: "async false skips; async true keeps",
				skipCond: async () => false,
				keepCond: async () => true,
				expectSkip: 0,
				expectKeep: 1,
			},
			{
				label: "both false → only root executes",
				skipCond: () => false,
				keepCond: () => false,
				expectSkip: 0,
				expectKeep: 0,
			},
		])("$label", async ({ skipCond, keepCond, expectSkip, expectKeep }) => {
			const rootAgent = new MockAgent("root");
			const skipAgent = new MockAgent("skip_me");
			const keepAgent = new MockAgent("keep_me");

			const graph = new LangGraphAgent({
				name: "cond_matrix",
				description: "desc",
				nodes: [
					{
						name: "root",
						agent: rootAgent,
						targets: ["skip_me", "keep_me"],
					},
					{
						name: "skip_me",
						agent: skipAgent,
						targets: [],
						condition: skipCond,
					},
					{
						name: "keep_me",
						agent: keepAgent,
						targets: [],
						condition: keepCond,
					},
				],
				rootNode: "root",
			});

			const events = await drainGraph(graph, mockContext);
			expect(rootAgent.executionCount).toBe(1);
			expect(skipAgent.executionCount).toBe(expectSkip);
			expect(keepAgent.executionCount).toBe(expectKeep);
			expect(events[events.length - 1].turnComplete).toBe(true);
		});

		it("passes lastEvent into condition for branching decisions", async () => {
			const root = new MockAgent("decide", "branch-b");
			const a = new MockAgent("path_a");
			const b = new MockAgent("path_b");

			const graph = new LangGraphAgent({
				name: "event_cond",
				description: "desc",
				nodes: [
					{ name: "decide", agent: root, targets: ["path_a", "path_b"] },
					{
						name: "path_a",
						agent: a,
						targets: [],
						condition: (last) => last.content?.parts?.[0]?.text === "branch-a",
					},
					{
						name: "path_b",
						agent: b,
						targets: [],
						condition: (last) => last.content?.parts?.[0]?.text === "branch-b",
					},
				],
				rootNode: "decide",
			});

			await drainGraph(graph, mockContext);
			expect(a.executionCount).toBe(0);
			expect(b.executionCount).toBe(1);
		});
	});

	describe("node throw Error.message vs String(object) matrix", () => {
		it.each([
			{
				label: "Error uses message",
				throwValue: new Error("node-boom"),
				expected: "node-boom",
			},
			{
				label: "string uses String",
				throwValue: "raw-fail",
				expected: "raw-fail",
			},
			{
				label: "number uses String",
				throwValue: 99,
				expected: "99",
			},
			{
				label: "plain object uses String",
				throwValue: { code: "x" },
				expected: "[object Object]",
			},
			{
				label: "boolean uses String",
				throwValue: true,
				expected: "true",
			},
		])("$label", async ({ throwValue, expected }) => {
			const thrower = new MockAgent("thrower");
			thrower.throwValue = throwValue;
			const graph = new LangGraphAgent({
				name: "throw_matrix",
				description: "desc",
				nodes: [{ name: "thrower", agent: thrower, targets: [] }],
				rootNode: "thrower",
			});

			const events = await drainGraph(graph, mockContext);
			expect(events).toHaveLength(1);
			expect(events[0].errorCode).toBe("NODE_EXECUTION_ERROR");
			expect(events[0].errorMessage).toBe(expected);
			expect(events[0].content?.parts?.[0]?.text).toBe(
				`Error in node "thrower": ${expected}`,
			);
		});

		it("stops graph after node error without executing later targets", async () => {
			const boom = new MockAgent("boom");
			boom.throwValue = new Error("stop-here");
			const later = new MockAgent("later");

			const graph = new LangGraphAgent({
				name: "stop_after_err",
				description: "desc",
				nodes: [
					{ name: "boom", agent: boom, targets: ["later"] },
					{ name: "later", agent: later, targets: [] },
				],
				rootNode: "boom",
			});

			const events = await drainGraph(graph, mockContext);
			expect(later.executionCount).toBe(0);
			expect(events[0].errorCode).toBe("NODE_EXECUTION_ERROR");
			expect(events.every((e) => e.turnComplete !== true)).toBe(true);
		});
	});

	describe("duplicate node / missing root throws", () => {
		it("throws on duplicate node names at construction", () => {
			const a1 = new MockAgent("dup");
			const a2 = new MockAgent("dup_other");
			expect(
				() =>
					new LangGraphAgent({
						name: "dup_graph",
						description: "desc",
						nodes: [
							{ name: "same", agent: a1, targets: [] },
							{ name: "same", agent: a2, targets: [] },
						],
						rootNode: "same",
					}),
			).toThrow("Duplicate node name in graph: same");
		});

		it("throws when rootNode is not present in nodes", () => {
			const only = new MockAgent("only");
			expect(
				() =>
					new LangGraphAgent({
						name: "missing_root",
						description: "desc",
						nodes: [{ name: "only", agent: only, targets: [] }],
						rootNode: "nope",
					}),
			).toThrow('Root node "nope" not found in graph nodes');
		});

		it("yields root-not-found event when root is deleted after construction", async () => {
			const root = new MockAgent("root_only");
			const spare = new MockAgent("spare");
			const graph = new LangGraphAgent({
				name: "runtime_root",
				description: "desc",
				nodes: [
					{ name: "root_only", agent: root, targets: [] },
					{ name: "spare", agent: spare, targets: [] },
				],
				rootNode: "root_only",
			});
			(graph as { nodes: Map<string, LangGraphNode> }).nodes.delete(
				"root_only",
			);

			const events = await drainGraph(graph, mockContext);
			expect(events).toHaveLength(1);
			expect(events[0].content?.parts?.[0]?.text).toBe(
				'Root node "root_only" not found.',
			);
		});
	});

	describe("maxSteps stop matrix", () => {
		it.each([
			{ maxSteps: 1, expectA: 1, expectB: 0, expectC: 0 },
			{ maxSteps: 2, expectA: 1, expectB: 1, expectC: 0 },
			{ maxSteps: 3, expectA: 1, expectB: 1, expectC: 1 },
		])("maxSteps=$maxSteps executes A=$expectA B=$expectB C=$expectC", async ({
			maxSteps,
			expectA,
			expectB,
			expectC,
		}) => {
			const a = new MockAgent("step_a");
			const b = new MockAgent("step_b");
			const c = new MockAgent("step_c");

			const graph = new LangGraphAgent({
				name: "cap_matrix",
				description: "desc",
				nodes: [
					{ name: "step_a", agent: a, targets: ["step_b"] },
					{ name: "step_b", agent: b, targets: ["step_c"] },
					{ name: "step_c", agent: c, targets: [] },
				],
				rootNode: "step_a",
				maxSteps,
			});

			const events = await drainGraph(graph, mockContext);
			expect(a.executionCount).toBe(expectA);
			expect(b.executionCount).toBe(expectB);
			expect(c.executionCount).toBe(expectC);
			expect(events[events.length - 1].turnComplete).toBe(true);
		});

		it("setMaxSteps rejects non-positive values after construction", () => {
			const agent = new MockAgent("bounded");
			const graph = new LangGraphAgent({
				name: "set_max",
				description: "desc",
				nodes: [{ name: "bounded", agent, targets: [] }],
				rootNode: "bounded",
				maxSteps: 4,
			});
			expect(() => graph.setMaxSteps(0)).toThrow(
				"maxSteps must be greater than 0",
			);
			expect(() => graph.setMaxSteps(-3)).toThrow(
				"maxSteps must be greater than 0",
			);
			graph.setMaxSteps(9);
			expect(graph.getMaxSteps()).toBe(9);
		});
	});
});
