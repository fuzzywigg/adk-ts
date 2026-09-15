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

	constructor(name: string) {
		super({ name, description: `Mock ${name}` });
	}

	async *runAsync(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		this.executionCount++;
		yield new Event({
			author: this.name,
			content: { parts: [{ text: `from ${this.name}` }] },
		});
	}
}

function createMockContext(): InvocationContext {
	return {
		invocationId: "twenty-second-lg-posinf-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-22",
			userId: "user-lg",
			appName: "app-lg",
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
	ctx: InvocationContext,
): Promise<Event[]> {
	const events: Event[] = [];
	for await (const event of graph["runAsyncImpl"](ctx)) {
		events.push(event);
	}
	return events;
}

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * twentieth pins true/`"true"`/`-0`/`NEGATIVE_INFINITY`/`[]` maxSteps.
 * Assert `POSITIVE_INFINITY` keeps and allows unbounded steps until
 * terminal — residual +Inf asymmetry vs `-Infinity` zero-run.
 */
describe("LangGraph maxSteps posinf twenty-second leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("POSITIVE_INFINITY maxSteps is kept and executes the root node", async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "pos_inf_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: Number.POSITIVE_INFINITY as any,
		});
		expect(graph.getMaxSteps()).toBe(Number.POSITIVE_INFINITY);
		const events = await drain(graph, createMockContext());
		expect(only.executionCount).toBe(1);
		expect(events.some((e) => e.author === "only")).toBe(true);
	});

	it("setMaxSteps(POSITIVE_INFINITY) does not throw (Infinity <= 0 is false)", () => {
		const graph = new LangGraphAgent({
			name: "set_pos_inf",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() =>
			graph.setMaxSteps(Number.POSITIVE_INFINITY as any),
		).not.toThrow();
		expect(graph.getMaxSteps()).toBe(Number.POSITIVE_INFINITY);
	});

	it("NEGATIVE_INFINITY still skips execution (twentieth control)", async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "neg_inf_ctrl",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: Number.NEGATIVE_INFINITY as any,
		});
		await drain(graph, createMockContext());
		expect(only.executionCount).toBe(0);
	});
});
