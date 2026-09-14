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
		invocationId: "lg-13-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-13",
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
 * Thirteenth leftover: ctor `maxSteps || 50` keeps string `"0"` (truthy).
 * Then `stepCount < "0"` → zero node runs. setMaxSteps("0") throws because
 * `"0" <= 0` coerces true (unlike NaN, which twelfth pins as non-throwing).
 */
describe("LangGraphAgent maxSteps string-zero thirteenth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ctor maxSteps "0" is kept, not coalesced to 50', () => {
		const graph = new LangGraphAgent({
			name: "str_zero_steps",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: "0" as any,
		});
		expect(graph.getMaxSteps()).toBe("0");
	});

	it('string "0" maxSteps skips node execution but still yields completion', async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "str_zero_run",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: "0" as any,
		});
		const events = await drain(graph, createMockContext());
		expect(only.executionCount).toBe(0);
		expect(events.at(-1)?.author).toBe("str_zero_run");
		expect(events.some((e) => e.author === "only")).toBe(false);
	});

	it('setMaxSteps("0") throws via <= 0 coercion (NaN does not)', () => {
		const graph = new LangGraphAgent({
			name: "set_str_zero",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps("0" as any)).toThrow(/greater than 0/);
		expect(() => graph.setMaxSteps(Number.NaN)).not.toThrow();
	});

	it('string "1" maxSteps still executes the root once (control)', async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "str_one_run",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: "1" as any,
		});
		const events = await drain(graph, createMockContext());
		expect(only.executionCount).toBe(1);
		expect(events.some((e) => e.author === "only")).toBe(true);
	});

	it("numeric 0 still coalesces to 50 (fifth control vs string zero)", () => {
		const graph = new LangGraphAgent({
			name: "num_zero_ctor",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 0,
		});
		expect(graph.getMaxSteps()).toBe(50);
	});
});
