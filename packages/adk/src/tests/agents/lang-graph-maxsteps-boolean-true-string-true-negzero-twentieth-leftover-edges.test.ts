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
		invocationId: "lg-20-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-20",
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

/**
 * Twentieth leftover: eighteenth pins `"false"` kept / zero runs /
 * setMaxSteps("false") no-throw. Boolean `true` keeps and runs one step
 * (`stepCount < 1`); string `"true"` shares NaN zero-run with `"false"`.
 * `-0` coalesces to 50; setMaxSteps asymmetries for true / -0 / [].
 */
describe("LangGraphAgent maxSteps boolean-true/string-true/negzero twentieth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("ctor maxSteps true is kept, not coalesced to 50", () => {
		const graph = new LangGraphAgent({
			name: "bool_true_steps",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: true as any,
		});
		expect(graph.getMaxSteps()).toBe(true);
	});

	it("boolean true maxSteps runs exactly one node step", async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "bool_true_run",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: true as any,
		});
		const events = await drain(graph, createMockContext());
		expect(only.executionCount).toBe(1);
		expect(events.some((e) => e.author === "only")).toBe(true);
	});

	it('ctor maxSteps "true" is kept (not coalesced to 50)', () => {
		const graph = new LangGraphAgent({
			name: "str_true_steps",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: "true" as any,
		});
		expect(graph.getMaxSteps()).toBe("true");
	});

	it('string "true" maxSteps skips node execution (stepCount < NaN)', async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "str_true_run",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: "true" as any,
		});
		const events = await drain(graph, createMockContext());
		expect(only.executionCount).toBe(0);
		expect(events.some((e) => e.author === "only")).toBe(false);
	});

	it("SameValueZero -0 maxSteps coalesces to 50 via ||", () => {
		const graph = new LangGraphAgent({
			name: "neg_zero_steps",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: -0 as any,
		});
		expect(graph.getMaxSteps()).toBe(50);
	});

	it("NEGATIVE_INFINITY maxSteps is kept and skips node execution", async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "neg_inf_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: Number.NEGATIVE_INFINITY as any,
		});
		expect(graph.getMaxSteps()).toBe(Number.NEGATIVE_INFINITY);
		const events = await drain(graph, createMockContext());
		expect(only.executionCount).toBe(0);
		expect(events.some((e) => e.author === "only")).toBe(false);
	});

	it("empty-array maxSteps is kept and skips node execution", async () => {
		const only = new MockAgent("only");
		const empty: never[] = [];
		const graph = new LangGraphAgent({
			name: "empty_arr_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: empty as any,
		});
		expect(graph.getMaxSteps()).toBe(empty);
		await drain(graph, createMockContext());
		expect(only.executionCount).toBe(0);
	});

	it("setMaxSteps(true) does not throw (true <= 0 is false)", () => {
		const graph = new LangGraphAgent({
			name: "set_bool_true",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps(true as any)).not.toThrow();
		expect(graph.getMaxSteps()).toBe(true);
	});

	it('setMaxSteps("true") does not throw (NaN <= 0 is false)', () => {
		const graph = new LangGraphAgent({
			name: "set_str_true",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps("true" as any)).not.toThrow();
		expect(graph.getMaxSteps()).toBe("true");
	});

	it("setMaxSteps(-0) still throws (SameValueZero <= 0)", () => {
		const graph = new LangGraphAgent({
			name: "set_neg_zero",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps(-0 as any)).toThrow(/greater than 0/);
	});

	it("setMaxSteps([]) still throws ([] <= 0 → 0 <= 0)", () => {
		const graph = new LangGraphAgent({
			name: "set_empty_arr",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps([] as any)).toThrow(/greater than 0/);
	});
});
