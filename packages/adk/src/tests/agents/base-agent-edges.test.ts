import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { Event } from "../../events/event";

class TestAgent extends BaseAgent {
	runAsyncImplMock = vi.fn(async function* (
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({ author: this.name });
	});

	protected async *runAsyncImpl(
		ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield* this.runAsyncImplMock(ctx);
	}

	protected async *runLiveImpl(
		ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield* this.runAsyncImplMock(ctx);
	}
}

const createMockContext = (agent: BaseAgent): InvocationContext =>
	({
		invocationId: "inv-edge",
		agent,
		branch: "",
		endInvocation: false,
		session: {
			id: "ses-edge",
			userId: "user-edge",
			appName: "edge-app",
			state: {},
			events: [],
			lastUpdateTime: 0,
		} as InvocationContext["session"],
		createChildContext: vi.fn(function (this: InvocationContext, childAgent) {
			return createMockContext(childAgent);
		}),
	}) as unknown as InvocationContext;

describe("BaseAgent leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("defaults description to empty string when omitted", () => {
		const agent = new TestAgent({ name: "no_desc" });
		expect(agent.description).toBe("");
	});

	it("defaults description to empty string when undefined", () => {
		const agent = new TestAgent({ name: "undef_desc", description: undefined });
		expect(agent.description).toBe("");
	});

	it("defaults subAgents to empty array when omitted", () => {
		const agent = new TestAgent({ name: "no_subs" });
		expect(agent.subAgents).toEqual([]);
	});

	it("defaults subAgents to empty array when undefined", () => {
		const agent = new TestAgent({ name: "undef_subs", subAgents: undefined });
		expect(agent.subAgents).toEqual([]);
	});

	it("throws for invalid agent names matching the regex guard", () => {
		const invalidNames = [
			"invalid-name",
			"1starts_with_digit",
			"has space",
			"has.dot",
			"",
		];
		for (const name of invalidNames) {
			expect(() => new TestAgent({ name })).toThrow(/invalid agent name/i);
		}
	});

	it("throws for reserved name user", () => {
		expect(() => new TestAgent({ name: "user" })).toThrow(
			"Agent name cannot be `user`",
		);
	});

	it("accepts valid identifier names", () => {
		expect(() => new TestAgent({ name: "_private" })).not.toThrow();
		expect(() => new TestAgent({ name: "Agent_1" })).not.toThrow();
	});

	it("findAgent returns undefined for misses in the subtree", () => {
		const leaf = new TestAgent({ name: "leaf" });
		const root = new TestAgent({ name: "root", subAgents: [leaf] });

		expect(root.findAgent("missing")).toBeUndefined();
		expect(leaf.findAgent("root")).toBeUndefined();
		expect(root.findAgent("leaf")).toBe(leaf);
	});

	it("findSubAgent returns undefined for self and misses", () => {
		const leaf = new TestAgent({ name: "leaf" });
		const mid = new TestAgent({ name: "mid", subAgents: [leaf] });
		const root = new TestAgent({ name: "tree_root", subAgents: [mid] });

		expect(root.findSubAgent("tree_root")).toBeUndefined();
		expect(mid.findSubAgent("mid")).toBeUndefined();
		expect(root.findSubAgent("missing")).toBeUndefined();
		expect(root.findSubAgent("leaf")).toBe(leaf);
	});

	it("beforeAgentCallback early return skips runAsyncImpl", async () => {
		const agent = new TestAgent({ name: "before_skip" });
		agent.beforeAgentCallback = () => ({
			parts: [{ text: "early exit" }],
		});
		const ctx = createMockContext(agent);
		let childCtx: InvocationContext | undefined;
		ctx.createChildContext = vi.fn((childAgent) => {
			childCtx = createMockContext(childAgent);
			return childCtx;
		}) as InvocationContext["createChildContext"];

		const events: Event[] = [];
		for await (const event of agent["runAsyncInternal"](ctx)) {
			events.push(event);
		}

		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		expect(events).toHaveLength(1);
		expect(events[0].content).toEqual({ parts: [{ text: "early exit" }] });
		expect(childCtx?.endInvocation).toBe(true);
	});

	it("afterAgentCallback early return still runs impl first", async () => {
		const agent = new TestAgent({ name: "after_override" });
		agent.afterAgentCallback = () => ({
			parts: [{ text: "after content" }],
		});
		const ctx = createMockContext(agent);

		const events: Event[] = [];
		for await (const event of agent["runAsyncInternal"](ctx)) {
			events.push(event);
		}

		expect(agent.runAsyncImplMock).toHaveBeenCalledOnce();
		expect(events).toHaveLength(2);
		expect(events[1].content).toEqual({ parts: [{ text: "after content" }] });
	});

	it("stops callback chain at first beforeAgentCallback that returns content", async () => {
		const first = vi.fn(() => undefined);
		const second = vi.fn(() => ({ parts: [{ text: "second wins" }] }));
		const third = vi.fn(() => ({ parts: [{ text: "never" }] }));
		const agent = new TestAgent({
			name: "cb_chain",
			beforeAgentCallback: [first, second, third],
		});
		const ctx = createMockContext(agent);

		for await (const _ of agent["runAsyncInternal"](ctx)) {
		}

		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();
		expect(third).not.toHaveBeenCalled();
		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
	});

	it("returns early from runAsyncInternal when endInvocation set during before stateDelta", async () => {
		const agent = new TestAgent({ name: "state_delta_end" });
		agent.beforeAgentCallback = (callbackContext) => {
			callbackContext.state.flag = true;
			return undefined;
		};
		agent.runAsyncImplMock.mockImplementation(async function* (
			ctx: InvocationContext,
		) {
			ctx.endInvocation = true;
			yield new Event({ author: this.name });
		});
		const ctx = createMockContext(agent);

		const events: Event[] = [];
		for await (const event of agent["runAsyncInternal"](ctx)) {
			events.push(event);
		}

		expect(events.length).toBeGreaterThanOrEqual(2);
		expect(events[0].actions?.stateDelta?.flag).toBe(true);
		expect(agent.runAsyncImplMock).toHaveBeenCalledOnce();
	});
});
