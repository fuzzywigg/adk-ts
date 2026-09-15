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
		invocationId: "lg-22-cond-inf",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-22-inf",
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
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * twenty-first pins condition true/`"true"`/`[]`/`-0`. Assert ±Infinity
 * execute target via `if (!shouldExecute)` — residual sentinel deepen.
 */
describe("LangGraphAgent condition infinity twenty-second leftover", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("executes target when condition returns $label", async ({ value }) => {
		const root = new MockAgent("inf_root");
		const child = new MockAgent("inf_child");
		const graph = new LangGraphAgent({
			name: "inf_cond",
			description: "d",
			nodes: [
				{ name: "inf_root", agent: root, targets: ["inf_child"] },
				{
					name: "inf_child",
					agent: child,
					targets: [],
					condition: () => value as any,
				},
			],
			rootNode: "inf_root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(1);
	});

	it("SameValueZero -0 condition still skips (twenty-first control)", async () => {
		const root = new MockAgent("neg0_root");
		const child = new MockAgent("neg0_child");
		const graph = new LangGraphAgent({
			name: "neg0_cond",
			description: "d",
			nodes: [
				{ name: "neg0_root", agent: root, targets: ["neg0_child"] },
				{
					name: "neg0_child",
					agent: child,
					targets: [],
					condition: () => -0 as any,
				},
			],
			rootNode: "neg0_root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(0);
	});
});
