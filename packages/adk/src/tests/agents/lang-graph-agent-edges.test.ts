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
		invocationId: "lg-edge-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg",
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

describe("LangGraphAgent leftover edges", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	it("defaults maxSteps to 50 when omitted", () => {
		const agent = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "default_steps",
			description: "desc",
			nodes: [{ name: "only", agent, targets: [] }],
			rootNode: "only",
		});
		expect(graph.getMaxSteps()).toBe(50);
	});

	it("treats maxSteps 0 as 50 via || fallback at construction", () => {
		const agent = new MockAgent("zero_steps");
		const graph = new LangGraphAgent({
			name: "zero_max",
			description: "desc",
			nodes: [{ name: "zero_steps", agent, targets: [] }],
			rootNode: "zero_steps",
			maxSteps: 0,
		});
		expect(graph.getMaxSteps()).toBe(50);
	});

	it("uses explicit positive maxSteps", () => {
		const agent = new MockAgent("bounded");
		const graph = new LangGraphAgent({
			name: "bounded",
			description: "desc",
			nodes: [{ name: "bounded", agent, targets: [] }],
			rootNode: "bounded",
			maxSteps: 3,
		});
		expect(graph.getMaxSteps()).toBe(3);
	});

	it("yields no-nodes message when nodes map is empty at runtime", async () => {
		const placeholder = new MockAgent("placeholder");
		const graph = new LangGraphAgent({
			name: "empty_runtime",
			description: "desc",
			nodes: [{ name: "placeholder", agent: placeholder, targets: [] }],
			rootNode: "placeholder",
		});
		Object.defineProperty(graph, "nodes", { value: new Map() });

		const events = await drainGraph(graph, mockContext);
		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe(
			"No nodes defined in the graph.",
		);
	});

	it("skips target nodes when condition returns false", async () => {
		const rootAgent = new MockAgent("root");
		const skipAgent = new MockAgent("skip_me");
		const keepAgent = new MockAgent("keep_me");

		const nodes: LangGraphNode[] = [
			{ name: "root", agent: rootAgent, targets: ["skip_me", "keep_me"] },
			{
				name: "skip_me",
				agent: skipAgent,
				targets: [],
				condition: () => false,
			},
			{
				name: "keep_me",
				agent: keepAgent,
				targets: [],
				condition: () => true,
			},
		];

		const graph = new LangGraphAgent({
			name: "cond_skip",
			description: "desc",
			nodes,
			rootNode: "root",
		});

		const events = await drainGraph(graph, mockContext);
		expect(rootAgent.executionCount).toBe(1);
		expect(skipAgent.executionCount).toBe(0);
		expect(keepAgent.executionCount).toBe(1);
		expect(events[events.length - 1].content?.parts?.[0]?.text).toContain(
			"keep_me",
		);
		expect(events[events.length - 1].content?.parts?.[0]?.text).not.toContain(
			"skip_me",
		);
	});

	it("logs and skips missing target nodes in getNextNodes", async () => {
		const rootAgent = new MockAgent("src");
		const validAgent = new MockAgent("valid");
		const ghostAgent = new MockAgent("ghost");

		const source: LangGraphNode = {
			name: "src",
			agent: rootAgent,
			targets: ["ghost", "valid"],
		};
		const valid: LangGraphNode = {
			name: "valid",
			agent: validAgent,
			targets: [],
		};
		const ghost: LangGraphNode = {
			name: "ghost",
			agent: ghostAgent,
			targets: [],
		};

		const graph = new LangGraphAgent({
			name: "missing_tgt",
			description: "desc",
			nodes: [source, valid, ghost],
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
		expect(next.map((n) => n.name)).toEqual(["valid"]);
	});

	it("stringifies non-Error throws in node catch via String(error)", async () => {
		const thrower = new MockAgent("string_throw");
		thrower.throwValue = "raw-string-failure";

		const graph = new LangGraphAgent({
			name: "string_err",
			description: "desc",
			nodes: [{ name: "string_throw", agent: thrower, targets: [] }],
			rootNode: "string_throw",
		});

		const events = await drainGraph(graph, mockContext);
		expect(events).toHaveLength(1);
		expect(events[0].errorCode).toBe("NODE_EXECUTION_ERROR");
		expect(events[0].errorMessage).toBe("raw-string-failure");
		expect(events[0].content?.parts?.[0]?.text).toBe(
			'Error in node "string_throw": raw-string-failure',
		);
	});

	it("stops graph walk at maxSteps before reaching all targets", async () => {
		const a = new MockAgent("step_a");
		const b = new MockAgent("step_b");
		const c = new MockAgent("step_c");

		const graph = new LangGraphAgent({
			name: "step_cap",
			description: "desc",
			nodes: [
				{ name: "step_a", agent: a, targets: ["step_b"] },
				{ name: "step_b", agent: b, targets: ["step_c"] },
				{ name: "step_c", agent: c, targets: [] },
			],
			rootNode: "step_a",
			maxSteps: 2,
		});

		const events = await drainGraph(graph, mockContext);
		expect(a.executionCount).toBe(1);
		expect(b.executionCount).toBe(1);
		expect(c.executionCount).toBe(0);
		expect(events[events.length - 1].turnComplete).toBe(true);
	});
});
