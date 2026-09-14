import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { Event } from "../../events/event";

class TestAgent extends BaseAgent {
	runAsyncImplMock = vi.fn(async function* (
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({
			author: this.name,
			content: { parts: [{ text: "impl" }] },
		});
	});

	protected async *runAsyncImpl(
		ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield* this.runAsyncImplMock(ctx);
	}

	protected async *runLiveImpl(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({
			author: this.name,
			content: { parts: [{ text: "live" }] },
		});
	}
}

const createMockContext = (agent: BaseAgent): InvocationContext =>
	({
		invocationId: "inv-sixth",
		agent,
		branch: "",
		endInvocation: false,
		session: {
			id: "ses-sixth",
			userId: "user-sixth",
			appName: "sixth-app",
			state: {},
			events: [],
			lastUpdateTime: 0,
		} as InvocationContext["session"],
		pluginManager: {
			runBeforeAgentCallback: vi.fn(async () => undefined),
			runAfterAgentCallback: vi.fn(async () => undefined),
		},
		createChildContext: vi.fn(function (this: InvocationContext, childAgent) {
			return createMockContext(childAgent);
		}),
	}) as unknown as InvocationContext;

async function collect(
	agent: TestAgent,
	overrides: Partial<InvocationContext> = {},
): Promise<{ events: Event[]; childCtx?: InvocationContext }> {
	const parent = createMockContext(agent);
	Object.assign(parent, overrides);
	let childCtx: InvocationContext | undefined;
	parent.createChildContext = vi.fn((childAgent) => {
		childCtx = createMockContext(childAgent);
		Object.assign(childCtx, overrides);
		return childCtx;
	}) as InvocationContext["createChildContext"];

	const events: Event[] = [];
	for await (const event of agent["runAsyncInternal"](parent)) {
		events.push(event);
	}
	return { events, childCtx };
}

/**
 * Sixth leftover: description/subAgents || coalesce with non-string falsy,
 * canonical callbacks treat [] as present, falsy callback content continues,
 * parentAgent null vs undefined, missing pluginManager optional chain.
 */
describe("BaseAgent callback-falsy / parent-null sixth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "null", value: null, expected: "" },
		{ label: "false", value: false, expected: "" },
		{ label: "0", value: 0, expected: "" },
		{ label: "NaN", value: Number.NaN, expected: "" },
	])("description $label coalesces via || to empty string", ({
		value,
		expected,
	}) => {
		const agent = new TestAgent({
			name: "desc_falsy",
			description: value as any,
		});
		expect(agent.description).toBe(expected);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "undefined", value: undefined },
	])("subAgents $label coalesces via || to []", ({ value }) => {
		const agent = new TestAgent({
			name: "subs_falsy",
			subAgents: value as any,
		});
		expect(agent.subAgents).toEqual([]);
	});

	it("empty subAgents array is truthy and kept by reference (not replaced)", () => {
		const empty: BaseAgent[] = [];
		const agent = new TestAgent({ name: "subs_empty_arr", subAgents: empty });
		expect(agent.subAgents).toBe(empty);
	});

	it("canonical callbacks: empty array is truthy so Array.isArray path returns the same list", () => {
		const emptyBefore: [] = [];
		const emptyAfter: [] = [];
		const agent = new TestAgent({
			name: "canon_empty_arr",
			beforeAgentCallback: emptyBefore,
			afterAgentCallback: emptyAfter,
		});
		expect(agent.canonicalBeforeAgentCallbacks).toBe(emptyBefore);
		expect(agent.canonicalAfterAgentCallbacks).toBe(emptyAfter);
		expect(agent.canonicalBeforeAgentCallbacks).toEqual([]);
	});

	it.each([
		null,
		false,
		0,
		"",
	] as const)("canonical callbacks: falsy %j hits !callback and returns []", (value) => {
		const agent = new TestAgent({
			name: "canon_falsy",
			beforeAgentCallback: value as any,
			afterAgentCallback: value as any,
		});
		expect(agent.canonicalBeforeAgentCallbacks).toEqual([]);
		expect(agent.canonicalAfterAgentCallbacks).toEqual([]);
	});

	it.each([
		{ label: "empty string", value: "" },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "null", value: null },
	])("before callback returning $label is skipped (if (result) falsy)", async ({
		value,
	}) => {
		const later = vi.fn(() => ({ parts: [{ text: "later-win" }] }));
		const agent = new TestAgent({
			name: "before_falsy_result",
			beforeAgentCallback: [() => value as any, later],
		});
		const { events } = await collect(agent);
		expect(later).toHaveBeenCalledOnce();
		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		expect(events[0].content).toEqual({ parts: [{ text: "later-win" }] });
	});

	it("before callback returning {} is truthy and short-circuits impl", async () => {
		const later = vi.fn(() => ({ parts: [{ text: "never" }] }));
		const agent = new TestAgent({
			name: "before_empty_obj",
			beforeAgentCallback: [() => ({}) as any, later],
		});
		const { events, childCtx } = await collect(agent);
		expect(later).not.toHaveBeenCalled();
		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		expect(events[0].content).toEqual({});
		expect(childCtx?.endInvocation).toBe(true);
	});

	it("rootAgent stops at undefined parent but treats null as a parent (then throws)", () => {
		const leaf = new TestAgent({ name: "null_parent_leaf" });
		expect(leaf.rootAgent).toBe(leaf);
		(leaf as { parentAgent?: BaseAgent | null }).parentAgent = null;
		expect(() => leaf.rootAgent).toThrow();
	});

	it("missing pluginManager is skipped via optional chaining so canonical callbacks still run", async () => {
		const before = vi.fn(() => ({ parts: [{ text: "no-plugin" }] }));
		const agent = new TestAgent({
			name: "no_plugin_mgr",
			beforeAgentCallback: before,
		});
		const { events } = await collect(agent, {
			pluginManager: undefined as any,
		});
		expect(before).toHaveBeenCalledOnce();
		expect(events[0].content).toEqual({ parts: [{ text: "no-plugin" }] });
	});

	it("findSubAgent continues when a child findAgent returns a falsy sentinel", () => {
		const ghost = new TestAgent({ name: "ghost_child" });
		const hit = new TestAgent({ name: "real_child" });
		const root = new TestAgent({
			name: "find_falsy",
			subAgents: [ghost, hit],
		});
		vi.spyOn(ghost, "findAgent").mockReturnValue(undefined);
		expect(root.findSubAgent("real_child")).toBe(hit);

		vi.spyOn(ghost, "findAgent").mockReturnValue(0 as any);
		expect(root.findSubAgent("real_child")).toBe(hit);
	});
});
