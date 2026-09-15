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
		invocationId: "lg-21n-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-21n",
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
 * `if (!shouldExecute)` — string `"-Infinity"` / `Object(0)` / `Object(NaN)`
 * execute (boxed zero/NaN are truthy).
 */
describe("LangGraphAgent condition string-neginfinity/object-zero/object-nan twenty-first residual deepen", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("executes target when condition returns $label", async ({ value }) => {
		const root = new MockAgent("str_neginf_root");
		const child = new MockAgent("str_neginf_child");
		const graph = new LangGraphAgent({
			name: "str_neginf_cond",
			description: "d",
			nodes: [
				{
					name: "str_neginf_root",
					agent: root,
					targets: ["str_neginf_child"],
				},
				{
					name: "str_neginf_child",
					agent: child,
					targets: [],
					condition: () => value as any,
				},
			],
			rootNode: "str_neginf_root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(1);
	});
});
