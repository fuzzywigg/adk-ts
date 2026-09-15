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
		invocationId: "lg-21s-max-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-21s-max",
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
 * Twenty-first leftover residual deepen (complements #284 posinf/nan/object-true):
 * `maxSteps || 50` — string `"Infinity"` / `Object(1)` keep+execute;
 * `Object(false)` keep but skip (`0 < 0`); setMaxSteps(`"Infinity"`/`Object(1)`)
 * ok; setMaxSteps(`Object(false)`) throws (`Number` → 0 ≤ 0).
 */
describe("LangGraphAgent maxSteps string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it('string "Infinity" maxSteps is kept and executes root', async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "str_inf_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: "Infinity" as any,
		});
		expect(graph.getMaxSteps()).toBe("Infinity");
		await drain(graph, createMockContext());
		expect(only.executionCount).toBe(1);
	});

	it("Object(1) maxSteps is kept and executes (0 < 1)", async () => {
		const only = new MockAgent("only");
		const boxed = Object(1);
		const graph = new LangGraphAgent({
			name: "obj_one_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: boxed as any,
		});
		expect(graph.getMaxSteps()).toBe(boxed);
		await drain(graph, createMockContext());
		expect(only.executionCount).toBe(1);
	});

	it("Object(false) maxSteps is kept and skips node execution (0 < 0)", async () => {
		const only = new MockAgent("only");
		const boxed = Object(false);
		const graph = new LangGraphAgent({
			name: "obj_false_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: boxed as any,
		});
		expect(graph.getMaxSteps()).toBe(boxed);
		await drain(graph, createMockContext());
		expect(only.executionCount).toBe(0);
	});

	it('setMaxSteps("Infinity") does not throw', () => {
		const graph = new LangGraphAgent({
			name: "set_str_inf",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps("Infinity" as any)).not.toThrow();
		expect(graph.getMaxSteps()).toBe("Infinity");
	});

	it("setMaxSteps(Object(1)) does not throw", () => {
		const boxed = Object(1);
		const graph = new LangGraphAgent({
			name: "set_obj_one",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps(boxed as any)).not.toThrow();
		expect(graph.getMaxSteps()).toBe(boxed);
	});

	it("setMaxSteps(Object(false)) throws (Number → 0; 0 <= 0)", () => {
		const graph = new LangGraphAgent({
			name: "set_obj_false",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps(Object(false) as any)).toThrow(
			"maxSteps must be greater than 0",
		);
	});
});
