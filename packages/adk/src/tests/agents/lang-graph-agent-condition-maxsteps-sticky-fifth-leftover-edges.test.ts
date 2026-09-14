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
	yieldEvents: Event[] | null = null;

	constructor(name: string) {
		super({ name, description: `Mock ${name}` });
	}

	async *runAsync(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		this.executionCount++;
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
		invocationId: "lg-fifth-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-fifth",
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

describe("LangGraphAgent fifth leftover — maxSteps || 50 falsy trap", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("coerces maxSteps: NaN to 50 via ||", () => {
		const graph = new LangGraphAgent({
			name: "nan_steps",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: Number.NaN,
		});
		expect(graph.getMaxSteps()).toBe(50);
	});

	it("coerces maxSteps: null to 50 via ||", () => {
		const graph = new LangGraphAgent({
			name: "null_steps",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: null as any,
		});
		expect(graph.getMaxSteps()).toBe(50);
	});

	it("coerces maxSteps: 0 to 50 via || (unlike setMaxSteps which rejects 0)", () => {
		const graph = new LangGraphAgent({
			name: "zero_steps",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 0,
		});
		expect(graph.getMaxSteps()).toBe(50);
	});

	it("keeps explicit positive maxSteps", () => {
		const graph = new LangGraphAgent({
			name: "pos_steps",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(graph.getMaxSteps()).toBe(3);
	});
});

describe("LangGraphAgent fifth leftover — condition truthy asymmetry", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	const falsyConditions = [0, "", null] as const;

	for (const value of falsyConditions) {
		it(`skips target when condition returns falsy ${JSON.stringify(value)}`, async () => {
			const root = new MockAgent("cond_root");
			const child = new MockAgent("cond_child");
			const graph = new LangGraphAgent({
				name: "falsy_cond",
				description: "d",
				nodes: [
					{ name: "cond_root", agent: root, targets: ["cond_child"] },
					{
						name: "cond_child",
						agent: child,
						targets: [],
						condition: () => value as any,
					},
				],
				rootNode: "cond_root",
			});
			await drain(graph, mockContext);
			expect(root.executionCount).toBe(1);
			expect(child.executionCount).toBe(0);
		});
	}

	const truthyConditions = [1, "keep", {}] as const;

	for (const value of truthyConditions) {
		it(`executes target when condition returns truthy ${JSON.stringify(value)}`, async () => {
			const root = new MockAgent("truthy_root");
			const child = new MockAgent("truthy_child");
			const graph = new LangGraphAgent({
				name: "truthy_cond",
				description: "d",
				nodes: [
					{ name: "truthy_root", agent: root, targets: ["truthy_child"] },
					{
						name: "truthy_child",
						agent: child,
						targets: [],
						condition: () => value as any,
					},
				],
				rootNode: "truthy_root",
			});
			await drain(graph, mockContext);
			expect(root.executionCount).toBe(1);
			expect(child.executionCount).toBe(1);
		});
	}
});

describe("LangGraphAgent fifth leftover — sticky lastEvent + root case", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	it("reuses sticky lastEvent from prior node when a silent mid-node yields nothing", async () => {
		const root = new MockAgent("sticky_root");
		root.yieldEvents = [
			new Event({
				author: "sticky_root",
				content: { parts: [{ text: "from-root" }] },
			}),
		];
		const silent = new MockAgent("sticky_silent");
		silent.yieldEvents = [];
		const leaf = new MockAgent("sticky_leaf");
		const seen: string[] = [];
		const graph = new LangGraphAgent({
			name: "sticky_graph",
			description: "d",
			nodes: [
				{ name: "sticky_root", agent: root, targets: ["sticky_silent"] },
				{
					name: "sticky_silent",
					agent: silent,
					targets: ["sticky_leaf"],
				},
				{
					name: "sticky_leaf",
					agent: leaf,
					targets: [],
					condition: (last) => {
						seen.push(String(last.content?.parts?.[0]?.text));
						return true;
					},
				},
			],
			rootNode: "sticky_root",
		});
		await drain(graph, mockContext);
		// silent yields nothing but outer lastEvent stays set from root, so
		// getNextNodes(silent, stickyRootEvent) still enqueues leaf.
		expect(root.executionCount).toBe(1);
		expect(silent.executionCount).toBe(1);
		expect(leaf.executionCount).toBe(1);
		expect(seen).toEqual(["from-root"]);
	});

	it("rootNode Map lookup is case-sensitive (Root ≠ root)", () => {
		expect(
			() =>
				new LangGraphAgent({
					name: "case_root",
					description: "d",
					nodes: [{ name: "root", agent: new MockAgent("root"), targets: [] }],
					rootNode: "Root",
				}),
		).toThrow(/Root node "Root" not found/);
	});

	it("target Map lookup is case-sensitive at validateGraph", () => {
		expect(
			() =>
				new LangGraphAgent({
					name: "case_target",
					description: "d",
					nodes: [
						{
							name: "src",
							agent: new MockAgent("src"),
							targets: ["Child"],
						},
						{ name: "child", agent: new MockAgent("child"), targets: [] },
					],
					rootNode: "src",
				}),
		).toThrow(/targets non-existent node "Child"/);
	});

	it("duplicate node names differ only by case are allowed as distinct Map keys", () => {
		const graph = new LangGraphAgent({
			name: "case_dup_ok",
			description: "d",
			nodes: [
				{ name: "Node", agent: new MockAgent("Node"), targets: [] },
				{ name: "node", agent: new MockAgent("node"), targets: [] },
			],
			rootNode: "node",
		});
		expect(graph.getNodes()).toHaveLength(2);
		expect(graph.getNode("Node")).toBeDefined();
		expect(graph.getNode("node")).toBeDefined();
	});
});
