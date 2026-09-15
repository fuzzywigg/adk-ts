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
		invocationId: "lg-21n-max-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-21n-max",
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
 * Twenty-first leftover residual deepen (complements #292 string-inf/obj-one/obj-false):
 * `maxSteps || 50` — string `"-Infinity"` / `Object(0)` / `Object(NaN)` keep but
 * skip (`0 < -Infinity|0|NaN`); setMaxSteps(`"-Infinity"`/`Object(0)`) throw;
 * setMaxSteps(`Object(NaN)`) does not throw (`NaN <= 0` is false).
 */
describe("LangGraphAgent maxSteps string-neginfinity/object-zero/object-nan twenty-first residual deepen", () => {
	it('string "-Infinity" maxSteps is kept and skips node execution', async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "str_neginf_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: "-Infinity" as any,
		});
		expect(graph.getMaxSteps()).toBe("-Infinity");
		await drain(graph, createMockContext());
		expect(only.executionCount).toBe(0);
	});

	it("Object(0) maxSteps is kept and skips node execution (0 < 0)", async () => {
		const only = new MockAgent("only");
		const boxed = Object(0);
		const graph = new LangGraphAgent({
			name: "obj_zero_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: boxed as any,
		});
		expect(graph.getMaxSteps()).toBe(boxed);
		await drain(graph, createMockContext());
		expect(only.executionCount).toBe(0);
	});

	it("Object(NaN) maxSteps is kept and skips node execution (0 < NaN)", async () => {
		const only = new MockAgent("only");
		const boxed = Object(Number.NaN);
		const graph = new LangGraphAgent({
			name: "obj_nan_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: boxed as any,
		});
		expect(graph.getMaxSteps()).toBe(boxed);
		await drain(graph, createMockContext());
		expect(only.executionCount).toBe(0);
	});

	it('setMaxSteps("-Infinity") throws (Number → -Infinity; -Inf <= 0)', () => {
		const graph = new LangGraphAgent({
			name: "set_str_neginf",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps("-Infinity" as any)).toThrow(
			"maxSteps must be greater than 0",
		);
	});

	it("setMaxSteps(Object(0)) throws (Number → 0; 0 <= 0)", () => {
		const graph = new LangGraphAgent({
			name: "set_obj_zero",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps(Object(0) as any)).toThrow(
			"maxSteps must be greater than 0",
		);
	});

	it("setMaxSteps(Object(NaN)) does not throw (NaN <= 0 is false)", () => {
		const boxed = Object(Number.NaN);
		const graph = new LangGraphAgent({
			name: "set_obj_nan",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps(boxed as any)).not.toThrow();
		expect(graph.getMaxSteps()).toBe(boxed);
	});
});
