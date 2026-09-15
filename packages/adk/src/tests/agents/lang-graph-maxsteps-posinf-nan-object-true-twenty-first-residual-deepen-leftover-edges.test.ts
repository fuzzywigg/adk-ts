import { describe, expect, it, vi } from "vitest";
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
		invocationId: "lg-21r-max-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-21r-max",
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
 * Twenty-first leftover residual deepen (complements #246 twentieth maxSteps
 * true/negzero/`-Infinity`): `maxSteps || 50` — POSITIVE_INFINITY / `1` /
 * `Object(true)` keep and execute; `NaN` coalesces to 50; `{}` kept but
 * `stepCount < {}` skips; setMaxSteps POSITIVE_INFINITY / NaN / `{}` ok
 * (`Number({})` is NaN; distinct from `[]` which throws via `0 <= 0`).
 */
describe("LangGraphAgent maxSteps posinf/nan/object-true twenty-first residual deepen", () => {
	it("POSITIVE_INFINITY maxSteps is kept and executes root", async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "pos_inf_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: Number.POSITIVE_INFINITY as any,
		});
		expect(graph.getMaxSteps()).toBe(Number.POSITIVE_INFINITY);
		await drain(graph, createMockContext());
		expect(only.executionCount).toBe(1);
	});

	it("NaN maxSteps coalesces to 50 via ||", () => {
		const graph = new LangGraphAgent({
			name: "nan_steps",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: Number.NaN as any,
		});
		expect(graph.getMaxSteps()).toBe(50);
	});

	it("number 1 maxSteps is kept and executes once", async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "one_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: 1,
		});
		expect(graph.getMaxSteps()).toBe(1);
		await drain(graph, createMockContext());
		expect(only.executionCount).toBe(1);
	});

	it("Object(true) maxSteps is kept and executes (0 < 1)", async () => {
		const only = new MockAgent("only");
		const boxed = Object(true);
		const graph = new LangGraphAgent({
			name: "obj_true_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: boxed as any,
		});
		expect(graph.getMaxSteps()).toBe(boxed);
		await drain(graph, createMockContext());
		expect(only.executionCount).toBe(1);
	});

	it("empty-object maxSteps is kept and skips node execution (0 < {})", async () => {
		const only = new MockAgent("only");
		const empty = {};
		const graph = new LangGraphAgent({
			name: "empty_obj_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: empty as any,
		});
		expect(graph.getMaxSteps()).toBe(empty);
		await drain(graph, createMockContext());
		expect(only.executionCount).toBe(0);
	});

	it("setMaxSteps(POSITIVE_INFINITY) does not throw", () => {
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

	it("setMaxSteps(NaN) does not throw (NaN <= 0 is false)", () => {
		const graph = new LangGraphAgent({
			name: "set_nan",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps(Number.NaN as any)).not.toThrow();
		expect(Number.isNaN(graph.getMaxSteps() as any)).toBe(true);
	});

	it("setMaxSteps({}) does not throw (Number({}) is NaN; NaN <= 0 is false)", () => {
		const empty = {};
		const graph = new LangGraphAgent({
			name: "set_empty_obj",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps(empty as any)).not.toThrow();
		expect(graph.getMaxSteps()).toBe(empty);
	});
});
