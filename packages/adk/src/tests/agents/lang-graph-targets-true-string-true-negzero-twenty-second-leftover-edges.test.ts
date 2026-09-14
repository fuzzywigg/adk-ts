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
		invocationId: "lg-22-targets",
		agent: {} as BaseAgent,
		branch: "",
		session: {
			id: "ses-lg-22",
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
 * Twenty-second leftover (HEAVY tip-relaunch residual after #251):
 * `if (node.targets)` in validateGraph + `if (!targets || length === 0)` in
 * getNextNodes. Boolean `true` / ±Infinity throw on for-of at construct;
 * `"true"`/`"false"` iterate chars and fail missing-node; SameValueZero
 * `-0` skips validate and is runtime-terminal; `[]` length-0 terminal —
 * residual true asymmetry after twenty-first condition tip.
 */
describe("LangGraphAgent targets true/string-true/negzero twenty-second leftover", () => {
	let mockContext: InvocationContext;

	beforeEach(() => {
		mockContext = createMockContext();
		vi.clearAllMocks();
	});

	it("SameValueZero -0 targets skips validateGraph and is runtime-terminal", async () => {
		const root = new MockAgent("neg0_root");
		const child = new MockAgent("neg0_child");
		const graph = new LangGraphAgent({
			name: "neg0_targets",
			description: "d",
			nodes: [
				{ name: "neg0_root", agent: root, targets: -0 as any },
				{ name: "neg0_child", agent: child, targets: [] },
			],
			rootNode: "neg0_root",
		});
		for await (const _ of graph["runAsyncImpl"](mockContext)) {
		}
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(0);
	});

	it("empty-array targets passes validate and is terminal via length === 0", async () => {
		const root = new MockAgent("arr_root");
		const child = new MockAgent("arr_child");
		const graph = new LangGraphAgent({
			name: "arr_targets",
			description: "d",
			nodes: [
				{ name: "arr_root", agent: root, targets: [] },
				{ name: "arr_child", agent: child, targets: [] },
			],
			rootNode: "arr_root",
		});
		for await (const _ of graph["runAsyncImpl"](mockContext)) {
		}
		expect(root.executionCount).toBe(1);
		expect(child.executionCount).toBe(0);
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("targets $label throws at construct (not iterable in validateGraph)", ({
		value,
	}) => {
		const root = new MockAgent("throw_root");
		expect(
			() =>
				new LangGraphAgent({
					name: "throw_targets",
					description: "d",
					nodes: [{ name: "throw_root", agent: root, targets: value as any }],
					rootNode: "throw_root",
				}),
		).toThrow(/not iterable/);
	});

	it('string "true" targets iterates chars and fails missing-node at construct', () => {
		const root = new MockAgent("str_true_root");
		expect(
			() =>
				new LangGraphAgent({
					name: "str_true_targets",
					description: "d",
					nodes: [
						{ name: "str_true_root", agent: root, targets: "true" as any },
					],
					rootNode: "str_true_root",
				}),
		).toThrow(/targets non-existent node "t"/);
	});

	it('string "false" targets still iterates chars at construct (control)', () => {
		const root = new MockAgent("str_false_root");
		expect(
			() =>
				new LangGraphAgent({
					name: "str_false_targets",
					description: "d",
					nodes: [
						{ name: "str_false_root", agent: root, targets: "false" as any },
					],
					rootNode: "str_false_root",
				}),
		).toThrow(/targets non-existent node "f"/);
	});
});
