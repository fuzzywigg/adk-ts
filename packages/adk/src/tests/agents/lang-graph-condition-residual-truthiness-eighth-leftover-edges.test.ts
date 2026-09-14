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
		invocationId: "lg-8-inv",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-8",
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
): Promise<void> {
	for await (const _ of graph["runAsyncImpl"](context)) {
	}
}

/**
 * Eighth leftover: getNextNodes uses `if (!shouldExecute) continue`.
 * Fifth leftover pinned 0/""/null skip and 1/"keep"/{} run.
 * Residual: false/undefined/NaN skip; "0"/[]/true run.
 */
describe("LangGraphAgent condition residual truthiness eighth leftover", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	it.each([
		{ label: "false", value: false },
		{ label: "undefined", value: undefined },
		{ label: "NaN", value: Number.NaN },
	])("skips target when condition returns $label", async ({ value }) => {
		const root = new MockAgent("root");
		const child = new MockAgent("child");
		const graph = new LangGraphAgent({
			name: "cond_skip",
			description: "d",
			nodes: [
				{ name: "root", agent: root, targets: ["child"] },
				{
					name: "child",
					agent: child,
					targets: [],
					condition: () => value as any,
				},
			],
			rootNode: "root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(0);
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: "[]", value: [] },
		{ label: "true", value: true },
	])("executes target when condition returns truthy $label", async ({
		value,
	}) => {
		const root = new MockAgent("root");
		const child = new MockAgent("child");
		const graph = new LangGraphAgent({
			name: "cond_keep",
			description: "d",
			nodes: [
				{ name: "root", agent: root, targets: ["child"] },
				{
					name: "child",
					agent: child,
					targets: [],
					condition: () => value as any,
				},
			],
			rootNode: "root",
		});
		await drain(graph, mockContext);
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(1);
	});
});
