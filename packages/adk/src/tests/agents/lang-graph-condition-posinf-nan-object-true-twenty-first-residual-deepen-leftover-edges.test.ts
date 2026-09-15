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
		invocationId: "lg-21r-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-21r",
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
 * Twenty-first leftover residual deepen (complements #251 true/negzero
 * condition): `if (!shouldExecute)` — POSITIVE_INFINITY / `1` / `{}` /
 * `Object(true)` execute; `NaN` skips.
 */
describe("LangGraphAgent condition posinf/nan/object-true twenty-first residual deepen", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("executes target when condition returns $label", async ({ value }) => {
		const root = new MockAgent("residual_root");
		const child = new MockAgent("residual_child");
		const graph = new LangGraphAgent({
			name: "residual_cond",
			description: "d",
			nodes: [
				{ name: "residual_root", agent: root, targets: ["residual_child"] },
				{
					name: "residual_child",
					agent: child,
					targets: [],
					condition: () => value as any,
				},
			],
			rootNode: "residual_root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(1);
	});

	it("NaN condition skips target", async () => {
		const root = new MockAgent("nan_root");
		const child = new MockAgent("nan_child");
		const graph = new LangGraphAgent({
			name: "nan_cond",
			description: "d",
			nodes: [
				{ name: "nan_root", agent: root, targets: ["nan_child"] },
				{
					name: "nan_child",
					agent: child,
					targets: [],
					condition: () => Number.NaN as any,
				},
			],
			rootNode: "nan_root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(0);
	});
});
