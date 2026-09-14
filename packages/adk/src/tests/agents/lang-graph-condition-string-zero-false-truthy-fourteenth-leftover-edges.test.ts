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
		invocationId: "lg-fourteenth-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-14",
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
 * Fourteenth leftover: `if (!shouldExecute)` skips only falsy values. String
 * `"0"` / `"false"` are truthy so the target still runs. Fifth leftover used
 * `1`/`"keep"`/`{}` and falsy `0`/`""`/`null` — not these lookalike strings.
 */
describe("LangGraphAgent condition string-zero/false truthy fourteenth leftover", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("executes target when condition returns truthy string $label", async ({
		value,
	}) => {
		const root = new MockAgent("str_root");
		const child = new MockAgent("str_child");
		const graph = new LangGraphAgent({
			name: "str_cond",
			description: "d",
			nodes: [
				{ name: "str_root", agent: root, targets: ["str_child"] },
				{
					name: "str_child",
					agent: child,
					targets: [],
					condition: () => value as any,
				},
			],
			rootNode: "str_root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(1);
	});

	it("numeric 0 condition still skips (fifth control)", async () => {
		const root = new MockAgent("num_root");
		const child = new MockAgent("num_child");
		const graph = new LangGraphAgent({
			name: "num_cond",
			description: "d",
			nodes: [
				{ name: "num_root", agent: root, targets: ["num_child"] },
				{
					name: "num_child",
					agent: child,
					targets: [],
					condition: () => 0 as any,
				},
			],
			rootNode: "num_root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(0);
	});

	it("boolean false condition still skips (fifth control)", async () => {
		const root = new MockAgent("bool_root");
		const child = new MockAgent("bool_child");
		const graph = new LangGraphAgent({
			name: "bool_cond",
			description: "d",
			nodes: [
				{ name: "bool_root", agent: root, targets: ["bool_child"] },
				{
					name: "bool_child",
					agent: child,
					targets: [],
					condition: () => false,
				},
			],
			rootNode: "bool_root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(0);
	});
});
