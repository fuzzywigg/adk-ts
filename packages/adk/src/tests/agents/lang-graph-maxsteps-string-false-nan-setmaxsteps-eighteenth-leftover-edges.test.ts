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
		invocationId: "lg-18-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-18",
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
 * Eighteenth leftover: thirteenth leftover pins `"0"` kept / zero runs /
 * setMaxSteps("0") throws. Assert `"false"` kept; zero runs via NaN compare;
 * setMaxSteps("false") does **not** throw (`NaN <= 0` is false) — asymmetry.
 */
describe("LangGraphAgent maxSteps string-false NaN setMaxSteps eighteenth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ctor maxSteps "false" is kept, not coalesced to 50', () => {
		const graph = new LangGraphAgent({
			name: "str_false_steps",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: "false" as any,
		});
		expect(graph.getMaxSteps()).toBe("false");
	});

	it('string "false" maxSteps skips node execution (0 < NaN)', async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "str_false_run",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: "false" as any,
		});
		const events = await drain(graph, createMockContext());
		expect(only.executionCount).toBe(0);
		expect(events.at(-1)?.author).toBe("str_false_run");
		expect(events.some((e) => e.author === "only")).toBe(false);
	});

	it('setMaxSteps("false") does not throw (NaN <= 0 is false)', () => {
		const graph = new LangGraphAgent({
			name: "set_str_false",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps("false" as any)).not.toThrow();
		expect(graph.getMaxSteps()).toBe("false");
	});

	it('setMaxSteps("0") still throws (thirteenth control asymmetry)', () => {
		const graph = new LangGraphAgent({
			name: "set_str_zero",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps("0" as any)).toThrow(/greater than 0/);
	});

	it("boolean false maxSteps still coalesces to 50 (fifth control)", () => {
		const graph = new LangGraphAgent({
			name: "bool_false_ctor",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: false as any,
		});
		expect(graph.getMaxSteps()).toBe(50);
	});
});
