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
		invocationId: "lg-21-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-21",
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
 * Twenty-first leftover: fourteenth pins condition `"0"`/`"false"` execute.
 * Assert boolean `true` / `"true"` execute target; SameValueZero `-0` skips —
 * residual true asymmetry after twentieth maxSteps tip.
 */
describe("LangGraphAgent condition true/string-true/negzero twenty-first leftover", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("executes target when condition returns $label", async ({ value }) => {
		const root = new MockAgent("true_root");
		const child = new MockAgent("true_child");
		const graph = new LangGraphAgent({
			name: "true_cond",
			description: "d",
			nodes: [
				{ name: "true_root", agent: root, targets: ["true_child"] },
				{
					name: "true_child",
					agent: child,
					targets: [],
					condition: () => value as any,
				},
			],
			rootNode: "true_root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(1);
	});

	it("SameValueZero -0 condition skips target", async () => {
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

	it("empty-array condition is truthy and executes target", async () => {
		const root = new MockAgent("arr_root");
		const child = new MockAgent("arr_child");
		const graph = new LangGraphAgent({
			name: "arr_cond",
			description: "d",
			nodes: [
				{ name: "arr_root", agent: root, targets: ["arr_child"] },
				{
					name: "arr_child",
					agent: child,
					targets: [],
					condition: () => [] as any,
				},
			],
			rootNode: "arr_root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(1);
	});

	it('string "false" still executes (fourteenth control asymmetry)', async () => {
		const root = new MockAgent("str_false_root");
		const child = new MockAgent("str_false_child");
		const graph = new LangGraphAgent({
			name: "str_false_cond",
			description: "d",
			nodes: [
				{ name: "str_false_root", agent: root, targets: ["str_false_child"] },
				{
					name: "str_false_child",
					agent: child,
					targets: [],
					condition: () => "false" as any,
				},
			],
			rootNode: "str_false_root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(1);
	});
});
