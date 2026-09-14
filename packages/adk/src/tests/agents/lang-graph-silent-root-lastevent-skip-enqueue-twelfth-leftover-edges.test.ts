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
		invocationId: "lg-silent-12",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-silent",
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

/**
 * Twelfth leftover: `if (lastEvent)` skips enqueue when the *root* yields
 * nothing (lastEvent stays null). Fifth leftover covers sticky lastEvent
 * when a *mid* node is silent after a yielding root.
 */
describe("LangGraphAgent silent-root lastEvent skip-enqueue twelfth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("silent root does not enqueue child even when targets exist", async () => {
		const root = new MockAgent("silent_root");
		root.yieldEvents = [];
		const child = new MockAgent("never_child");
		const graph = new LangGraphAgent({
			name: "silent_graph",
			description: "d",
			nodes: [
				{ name: "silent_root", agent: root, targets: ["never_child"] },
				{ name: "never_child", agent: child, targets: [] },
			],
			rootNode: "silent_root",
		});
		const events: Event[] = [];
		for await (const event of graph["runAsyncImpl"](createMockContext())) {
			events.push(event);
		}
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(0);
		expect(events.some((e) => e.author === "never_child")).toBe(false);
		expect(events.at(-1)?.author).toBe("silent_graph");
	});

	it("yielding root still enqueues child (control)", async () => {
		const root = new MockAgent("talk_root");
		const child = new MockAgent("talk_child");
		const graph = new LangGraphAgent({
			name: "talk_graph",
			description: "d",
			nodes: [
				{ name: "talk_root", agent: root, targets: ["talk_child"] },
				{ name: "talk_child", agent: child, targets: [] },
			],
			rootNode: "talk_root",
		});
		for await (const _ of graph["runAsyncImpl"](createMockContext())) {
		}
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(1);
	});
});
