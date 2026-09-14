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
		invocationId: "lg-12-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-12",
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
 * Twelfth leftover: ctor `maxSteps || 50` keeps whitespace (truthy). Then
 * `stepCount < " "` coerces to `0 < 0` so the loop never runs. setMaxSteps(NaN)
 * does not throw because `NaN <= 0` is false (unlike 0).
 */
describe("LangGraphAgent maxSteps whitespace + setMaxSteps NaN twelfth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("ctor maxSteps space is kept, not coalesced to 50", () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "ws_steps",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: " " as any,
		});
		expect(graph.getMaxSteps()).toBe(" ");
	});

	it("whitespace maxSteps skips node execution but still yields completion", async () => {
		const only = new MockAgent("only");
		const graph = new LangGraphAgent({
			name: "ws_steps_run",
			description: "d",
			nodes: [{ name: "only", agent: only, targets: [] }],
			rootNode: "only",
			maxSteps: " " as any,
		});
		const events = await drain(graph, createMockContext());
		expect(only.executionCount).toBe(0);
		expect(events.at(-1)?.author).toBe("ws_steps_run");
		expect(events.some((e) => e.author === "only")).toBe(false);
	});

	it("setMaxSteps(NaN) does not throw; setMaxSteps(0) still throws", () => {
		const graph = new LangGraphAgent({
			name: "nan_set",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 3,
		});
		expect(() => graph.setMaxSteps(Number.NaN)).not.toThrow();
		expect(Number.isNaN(graph.getMaxSteps())).toBe(true);
		expect(() => graph.setMaxSteps(0)).toThrow(/greater than 0/);
	});

	it("ctor maxSteps 0 still coalesces to 50 (fifth control)", () => {
		const graph = new LangGraphAgent({
			name: "zero_ctor",
			description: "d",
			nodes: [{ name: "only", agent: new MockAgent("only"), targets: [] }],
			rootNode: "only",
			maxSteps: 0,
		});
		expect(graph.getMaxSteps()).toBe(50);
	});
});
