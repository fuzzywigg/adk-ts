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

	runLiveImplMock = vi.fn(async function* (
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({
			author: this.name,
			content: { parts: [{ text: "live" }] },
		});
	});

	protected async *runAsyncImpl(
		ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield* this.runAsyncImplMock(ctx);
	}

	protected async *runLiveImpl(
		ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield* this.runLiveImplMock(ctx);
	}
}

const createMockContext = (agent: BaseAgent): InvocationContext =>
	({
		invocationId: "fourth-base-inv",
		agent,
		branch: "",
		endInvocation: false,
		session: {
			id: "ses-base-fourth",
			userId: "user-base",
			appName: "base-app",
			state: {},
			events: [],
			lastUpdateTime: 0,
		} as InvocationContext["session"],
		createChildContext: vi.fn(function (this: InvocationContext, childAgent) {
			return createMockContext(childAgent);
		}),
	}) as unknown as InvocationContext;

describe("BaseAgent fourth leftover edges — findAgent / findSubAgent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("findAgent returns self when names match", () => {
		const agent = new TestAgent({ name: "self_match" });
		expect(agent.findAgent("self_match")).toBe(agent);
	});

	it("findAgent walks deep descendants via findSubAgent", () => {
		const leaf = new TestAgent({ name: "deep_leaf" });
		const mid = new TestAgent({ name: "deep_mid", subAgents: [leaf] });
		const root = new TestAgent({ name: "deep_root", subAgents: [mid] });
		expect(root.findAgent("deep_leaf")).toBe(leaf);
		expect(root.findAgent("deep_mid")).toBe(mid);
		expect(root.findAgent("deep_root")).toBe(root);
	});

	it("findSubAgent does not match self and searches first matching branch", () => {
		const a = new TestAgent({ name: "branch_a" });
		const b = new TestAgent({ name: "branch_b" });
		const root = new TestAgent({
			name: "find_root",
			subAgents: [a, b],
		});
		expect(root.findSubAgent("find_root")).toBeUndefined();
		expect(root.findSubAgent("branch_a")).toBe(a);
		expect(root.findSubAgent("branch_b")).toBe(b);
		expect(root.findSubAgent("missing")).toBeUndefined();
	});

	it("findSubAgent returns undefined when subAgents empty", () => {
		const agent = new TestAgent({ name: "lonely" });
		expect(agent.findSubAgent("anything")).toBeUndefined();
	});

	it("rootAgent walks parent chain to the top", () => {
		const leaf = new TestAgent({ name: "leaf_root" });
		const mid = new TestAgent({ name: "mid_root", subAgents: [leaf] });
		const root = new TestAgent({ name: "top_root", subAgents: [mid] });
		expect(leaf.rootAgent).toBe(root);
		expect(mid.rootAgent).toBe(root);
		expect(root.rootAgent).toBe(root);
	});

	it("throws when a sub-agent already has a parent", () => {
		const child = new TestAgent({ name: "owned_child" });
		new TestAgent({ name: "first_parent", subAgents: [child] });
		expect(
			() => new TestAgent({ name: "second_parent", subAgents: [child] }),
		).toThrow(/already has a parent agent/);
	});

	it("canonicalBeforeAgentCallbacks wraps single and array forms", () => {
		const cb = () => undefined;
		const single = new TestAgent({
			name: "before_single",
			beforeAgentCallback: cb,
		});
		expect(single.canonicalBeforeAgentCallbacks).toEqual([cb]);

		const multi = new TestAgent({
			name: "before_multi",
			beforeAgentCallback: [cb, cb],
		});
		expect(multi.canonicalBeforeAgentCallbacks).toHaveLength(2);

		const none = new TestAgent({ name: "before_none" });
		expect(none.canonicalBeforeAgentCallbacks).toEqual([]);
	});

	it("canonicalAfterAgentCallbacks wraps single and array forms", () => {
		const cb = () => undefined;
		const single = new TestAgent({
			name: "after_single",
			afterAgentCallback: cb,
		});
		expect(single.canonicalAfterAgentCallbacks).toEqual([cb]);

		const multi = new TestAgent({
			name: "after_multi",
			afterAgentCallback: [cb, cb],
		});
		expect(multi.canonicalAfterAgentCallbacks).toHaveLength(2);

		const none = new TestAgent({ name: "after_none" });
		expect(none.canonicalAfterAgentCallbacks).toEqual([]);
	});
});

describe("BaseAgent fourth leftover edges — runAsync / runLive early returns", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("runAsyncInternal returns after before callback sets endInvocation", async () => {
		const agent = new TestAgent({ name: "async_early" });
		agent.beforeAgentCallback = () => ({
			parts: [{ text: "stop-async" }],
		});
		const ctx = createMockContext(agent);
		let child: InvocationContext | undefined;
		ctx.createChildContext = vi.fn((childAgent) => {
			child = createMockContext(childAgent);
			return child;
		}) as InvocationContext["createChildContext"];

		const events: Event[] = [];
		for await (const event of agent["runAsyncInternal"](ctx)) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("stop-async");
		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		expect(child?.endInvocation).toBe(true);
	});

	it("runLiveInternal returns after before callback sets endInvocation", async () => {
		const agent = new TestAgent({ name: "live_early" });
		agent.beforeAgentCallback = () => ({
			parts: [{ text: "stop-live" }],
		});
		const ctx = createMockContext(agent);
		let child: InvocationContext | undefined;
		ctx.createChildContext = vi.fn((childAgent) => {
			child = createMockContext(childAgent);
			return child;
		}) as InvocationContext["createChildContext"];

		const events: Event[] = [];
		for await (const event of agent["runLiveInternal"](ctx)) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("stop-live");
		expect(agent.runLiveImplMock).not.toHaveBeenCalled();
		expect(child?.endInvocation).toBe(true);
	});

	it("runAsyncInternal skips after callback when endInvocation set during impl", async () => {
		const agent = new TestAgent({ name: "async_mid_end" });
		agent.afterAgentCallback = () => ({
			parts: [{ text: "should-not-run" }],
		});
		agent.runAsyncImplMock.mockImplementation(async function* (ctx) {
			yield new Event({ author: this.name });
			ctx.endInvocation = true;
		});
		const ctx = createMockContext(agent);

		const events: Event[] = [];
		for await (const event of agent["runAsyncInternal"](ctx)) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).not.toBe("should-not-run");
	});

	it("runLiveInternal still runs after callback even if endInvocation set mid-impl", async () => {
		const agent = new TestAgent({ name: "live_after_still" });
		agent.afterAgentCallback = () => ({
			parts: [{ text: "live-after" }],
		});
		agent.runLiveImplMock.mockImplementation(async function* (ctx) {
			yield new Event({ author: this.name });
			ctx.endInvocation = true;
		});
		const ctx = createMockContext(agent);

		const events: Event[] = [];
		for await (const event of agent["runLiveInternal"](ctx)) {
			events.push(event);
		}

		expect(events.map((e) => e.content?.parts?.[0]?.text)).toContain(
			"live-after",
		);
	});

	it("awaited beforeAgentCallback promise content ends invocation", async () => {
		const agent = new TestAgent({ name: "async_before" });
		agent.beforeAgentCallback = async () => ({
			parts: [{ text: "async-before" }],
		});
		const ctx = createMockContext(agent);

		const events: Event[] = [];
		for await (const event of agent["runAsyncInternal"](ctx)) {
			events.push(event);
		}
		expect(events[0].content?.parts?.[0]?.text).toBe("async-before");
		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
	});

	it("awaited afterAgentCallback promise content is yielded", async () => {
		const agent = new TestAgent({ name: "async_after" });
		agent.afterAgentCallback = async () => ({
			parts: [{ text: "async-after" }],
		});
		const ctx = createMockContext(agent);

		const events: Event[] = [];
		for await (const event of agent["runAsyncInternal"](ctx)) {
			events.push(event);
		}
		expect(events.at(-1)?.content?.parts?.[0]?.text).toBe("async-after");
	});

	it("before callback chain stops at first truthy content", async () => {
		const first = vi.fn(() => undefined);
		const second = vi.fn(() => ({ parts: [{ text: "second" }] }));
		const third = vi.fn(() => ({ parts: [{ text: "third" }] }));
		const agent = new TestAgent({
			name: "before_chain",
			beforeAgentCallback: [first, second, third],
		});
		const ctx = createMockContext(agent);
		for await (const _ of agent["runAsyncInternal"](ctx)) {
		}
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();
		expect(third).not.toHaveBeenCalled();
	});

	it("after callback chain stops at first truthy content", async () => {
		const first = vi.fn(() => undefined);
		const second = vi.fn(() => ({ parts: [{ text: "after-second" }] }));
		const third = vi.fn(() => ({ parts: [{ text: "after-third" }] }));
		const agent = new TestAgent({
			name: "after_chain",
			afterAgentCallback: [first, second, third],
		});
		const ctx = createMockContext(agent);
		const events: Event[] = [];
		for await (const event of agent["runAsyncInternal"](ctx)) {
			events.push(event);
		}
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();
		expect(third).not.toHaveBeenCalled();
		expect(events.at(-1)?.content?.parts?.[0]?.text).toBe("after-second");
	});

	it("default runAsyncImpl throws not implemented for bare subclass", async () => {
		class Bare extends BaseAgent {}
		const bare = new Bare({ name: "bare_async" });
		const ctx = createMockContext(bare);
		await expect(async () => {
			for await (const _ of bare["runAsyncImpl"](ctx)) {
			}
		}).rejects.toThrow(/runAsyncImpl for Bare is not implemented/);
	});

	it("default runLiveImpl throws not implemented for bare subclass", async () => {
		class Bare extends BaseAgent {}
		const bare = new Bare({ name: "bare_live" });
		const ctx = createMockContext(bare);
		await expect(async () => {
			for await (const _ of bare["runLiveImpl"](ctx)) {
			}
		}).rejects.toThrow(/runLiveImpl for Bare is not implemented/);
	});

	it("runAsync delegates through runAsyncInternal", async () => {
		const agent = new TestAgent({ name: "public_async" });
		const ctx = createMockContext(agent);
		const events: Event[] = [];
		for await (const event of agent.runAsync(ctx)) {
			events.push(event);
		}
		expect(agent.runAsyncImplMock).toHaveBeenCalledOnce();
		expect(events[0].content?.parts?.[0]?.text).toBe("impl");
	});

	it("runLive delegates through runLiveInternal", async () => {
		const agent = new TestAgent({ name: "public_live" });
		const ctx = createMockContext(agent);
		const events: Event[] = [];
		for await (const event of agent.runLive(ctx)) {
			events.push(event);
		}
		expect(agent.runLiveImplMock).toHaveBeenCalledOnce();
		expect(events[0].content?.parts?.[0]?.text).toBe("live");
	});
});
