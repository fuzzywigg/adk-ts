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
		invocationId: "inv-matrix",
		agent,
		branch: "",
		endInvocation: false,
		session: {
			id: "ses-matrix",
			userId: "user-matrix",
			appName: "matrix-app",
			state: {},
			events: [],
			lastUpdateTime: 0,
		} as InvocationContext["session"],
		createChildContext: vi.fn(function (this: InvocationContext, childAgent) {
			return createMockContext(childAgent);
		}),
	}) as unknown as InvocationContext;

async function collect(
	agent: TestAgent,
	mode: "async" | "live" = "async",
): Promise<{ events: Event[]; childCtx?: InvocationContext }> {
	const parent = createMockContext(agent);
	let childCtx: InvocationContext | undefined;
	parent.createChildContext = vi.fn((childAgent) => {
		childCtx = createMockContext(childAgent);
		return childCtx;
	}) as InvocationContext["createChildContext"];

	const events: Event[] = [];
	const iter =
		mode === "async"
			? agent["runAsyncInternal"](parent)
			: agent["runLiveInternal"](parent);
	for await (const event of iter) {
		events.push(event);
	}
	return { events, childCtx };
}

describe("BaseAgent leftover matrix edges (TOKENMAXX deepen)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('description || "" and subAgents || [] matrix', () => {
		it.each([
			{
				label: 'omitted description → ""',
				config: { name: "d_omit" },
				expectDesc: "",
				expectSubs: [],
			},
			{
				label: 'undefined description → ""',
				config: { name: "d_undef", description: undefined },
				expectDesc: "",
				expectSubs: [],
			},
			{
				label: 'explicit empty description stays ""',
				config: { name: "d_empty", description: "" },
				expectDesc: "",
				expectSubs: [],
			},
			{
				label: "non-empty description preserved",
				config: { name: "d_keep", description: "capable" },
				expectDesc: "capable",
				expectSubs: [],
			},
			{
				label: "omitted subAgents → []",
				config: { name: "s_omit", description: "x" },
				expectDesc: "x",
				expectSubs: [],
			},
			{
				label: "undefined subAgents → []",
				config: { name: "s_undef", subAgents: undefined },
				expectDesc: "",
				expectSubs: [],
			},
		])("$label", ({ config, expectDesc, expectSubs }) => {
			const agent = new TestAgent(config as any);
			expect(agent.description).toBe(expectDesc);
			expect(agent.subAgents).toEqual(expectSubs);
		});

		it("wires provided subAgents and sets parentAgent", () => {
			const leaf = new TestAgent({ name: "leaf_wired" });
			const root = new TestAgent({
				name: "root_wired",
				subAgents: [leaf],
			});
			expect(root.subAgents).toEqual([leaf]);
			expect(leaf.parentAgent).toBe(root);
		});

		it("throws when a sub-agent already has a parent", () => {
			const leaf = new TestAgent({ name: "already_owned" });
			new TestAgent({ name: "first_parent", subAgents: [leaf] });
			expect(
				() => new TestAgent({ name: "second_parent", subAgents: [leaf] }),
			).toThrow(/already has a parent agent/);
		});
	});

	describe("invalid name regex / reserved user matrix", () => {
		it.each([
			"bad-name",
			"1digit",
			"has space",
			"has.dot",
			"has@at",
			"",
			"dash-end-",
		])("rejects invalid name %j", (name) => {
			expect(() => new TestAgent({ name })).toThrow(/invalid agent name/i);
		});

		it("rejects reserved name user", () => {
			expect(() => new TestAgent({ name: "user" })).toThrow(
				"Agent name cannot be `user`",
			);
		});

		it.each([
			"_ok",
			"Agent_1",
			"a",
			"Z9_",
			"camelCase",
		])("accepts valid name %j", (name) => {
			expect(() => new TestAgent({ name })).not.toThrow();
		});
	});

	describe("before/after callback short-circuit order matrices", () => {
		it("runs impl when every before callback returns undefined", async () => {
			const first = vi.fn(() => undefined);
			const second = vi.fn(async () => undefined);
			const agent = new TestAgent({
				name: "before_all_undef",
				beforeAgentCallback: [first, second],
			});

			const { events } = await collect(agent);
			expect(first).toHaveBeenCalledOnce();
			expect(second).toHaveBeenCalledOnce();
			expect(agent.runAsyncImplMock).toHaveBeenCalledOnce();
			expect(events.some((e) => e.content?.parts?.[0]?.text === "impl")).toBe(
				true,
			);
		});

		it("stops before chain at first truthy content and skips later callbacks + impl", async () => {
			const order: string[] = [];
			const agent = new TestAgent({
				name: "before_short",
				beforeAgentCallback: [
					() => {
						order.push("1");
						return undefined;
					},
					() => {
						order.push("2");
						return { parts: [{ text: "stop" }] };
					},
					() => {
						order.push("3");
						return { parts: [{ text: "never" }] };
					},
				],
			});

			const { events, childCtx } = await collect(agent);
			expect(order).toEqual(["1", "2"]);
			expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
			expect(events).toHaveLength(1);
			expect(events[0].content).toEqual({ parts: [{ text: "stop" }] });
			expect(childCtx?.endInvocation).toBe(true);
		});

		it("stops after chain at first truthy content after impl runs", async () => {
			const order: string[] = [];
			const agent = new TestAgent({
				name: "after_short",
				afterAgentCallback: [
					async () => {
						order.push("a");
						return undefined;
					},
					() => {
						order.push("b");
						return { parts: [{ text: "after-win" }] };
					},
					() => {
						order.push("c");
						return { parts: [{ text: "never" }] };
					},
				],
			});

			const { events } = await collect(agent);
			expect(order).toEqual(["a", "b"]);
			expect(agent.runAsyncImplMock).toHaveBeenCalledOnce();
			expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"impl",
				"after-win",
			]);
		});

		it("awaits Promise before callbacks that resolve to content", async () => {
			const agent = new TestAgent({
				name: "before_promise",
				beforeAgentCallback: async () => ({
					parts: [{ text: "async-before" }],
				}),
			});
			const { events } = await collect(agent);
			expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
			expect(events[0].content?.parts?.[0]?.text).toBe("async-before");
		});

		it("canonicalBefore/AfterAgentCallbacks normalize single vs array", () => {
			const single = () => undefined;
			const agent = new TestAgent({
				name: "canon_cb",
				beforeAgentCallback: single,
				afterAgentCallback: [single, single],
			});
			expect(agent.canonicalBeforeAgentCallbacks).toEqual([single]);
			expect(agent.canonicalAfterAgentCallbacks).toHaveLength(2);
			const bare = new TestAgent({ name: "canon_empty" });
			expect(bare.canonicalBeforeAgentCallbacks).toEqual([]);
			expect(bare.canonicalAfterAgentCallbacks).toEqual([]);
		});
	});

	describe("endInvocation mid-callback / mid-impl matrices", () => {
		it("before content short-circuit sets endInvocation and skips after callbacks", async () => {
			const after = vi.fn(() => ({ parts: [{ text: "after" }] }));
			const agent = new TestAgent({
				name: "end_before",
				beforeAgentCallback: () => ({ parts: [{ text: "early" }] }),
				afterAgentCallback: after,
			});
			const { events } = await collect(agent);
			expect(events).toHaveLength(1);
			expect(after).not.toHaveBeenCalled();
			expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		});

		it("endInvocation during runAsyncImpl skips after callbacks", async () => {
			const after = vi.fn(() => ({ parts: [{ text: "after" }] }));
			const agent = new TestAgent({
				name: "end_mid_impl",
				afterAgentCallback: after,
			});
			agent.runAsyncImplMock.mockImplementation(async function* (ctx) {
				ctx.endInvocation = true;
				yield new Event({
					author: this.name,
					content: { parts: [{ text: "mid" }] },
				});
			});

			const { events } = await collect(agent);
			expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual(["mid"]);
			expect(after).not.toHaveBeenCalled();
		});

		it("runLiveInternal still invokes after callbacks even if endInvocation set mid-impl", async () => {
			const after = vi.fn(() => ({ parts: [{ text: "live-after" }] }));
			const agent = new TestAgent({
				name: "live_end",
				afterAgentCallback: after,
			});
			agent.runLiveImplMock.mockImplementation(async function* (ctx) {
				ctx.endInvocation = true;
				yield new Event({
					author: this.name,
					content: { parts: [{ text: "live-mid" }] },
				});
			});

			const { events } = await collect(agent, "live");
			expect(after).toHaveBeenCalledOnce();
			expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"live-mid",
				"live-after",
			]);
		});

		it("before stateDelta event does not set endInvocation by itself", async () => {
			const agent = new TestAgent({ name: "delta_only" });
			agent.beforeAgentCallback = (cbCtx) => {
				cbCtx.state.flag = true;
				return undefined;
			};
			const { events, childCtx } = await collect(agent);
			expect(events[0].actions?.stateDelta?.flag).toBe(true);
			expect(childCtx?.endInvocation).toBe(false);
			expect(agent.runAsyncImplMock).toHaveBeenCalledOnce();
		});
	});

	describe("findAgent recursive matrix", () => {
		it("returns self when name matches root", () => {
			const root = new TestAgent({ name: "self_root" });
			expect(root.findAgent("self_root")).toBe(root);
		});

		it("finds deep descendants and misses across branches", () => {
			const leafA = new TestAgent({ name: "leaf_a" });
			const leafB = new TestAgent({ name: "leaf_b" });
			const mid = new TestAgent({ name: "mid", subAgents: [leafA, leafB] });
			const other = new TestAgent({ name: "other_branch" });
			const root = new TestAgent({
				name: "tree",
				subAgents: [mid, other],
			});

			expect(root.findAgent("leaf_b")).toBe(leafB);
			expect(root.findAgent("mid")).toBe(mid);
			expect(root.findAgent("other_branch")).toBe(other);
			expect(root.findAgent("missing")).toBeUndefined();
			expect(mid.findAgent("tree")).toBeUndefined();
			expect(root.findSubAgent("tree")).toBeUndefined();
			expect(root.findSubAgent("leaf_a")).toBe(leafA);
			expect(leafA.findSubAgent("leaf_a")).toBeUndefined();
		});

		it("rootAgent walks to the top of the tree", () => {
			const leaf = new TestAgent({ name: "deep_leaf" });
			const mid = new TestAgent({ name: "deep_mid", subAgents: [leaf] });
			const root = new TestAgent({ name: "deep_root", subAgents: [mid] });
			expect(leaf.rootAgent).toBe(root);
			expect(mid.rootAgent).toBe(root);
			expect(root.rootAgent).toBe(root);
		});
	});
});
