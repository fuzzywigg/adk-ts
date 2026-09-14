import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { Event } from "../../events/event";
import { PluginManager } from "../../plugins/plugin-manager";
import { BasePlugin } from "../../plugins/base-plugin";

vi.mock("../../telemetry", () => ({
	telemetryService: {
		traceAsyncGenerator: async function* (_name: string, gen: AsyncGenerator) {
			yield* gen;
		},
	},
}));

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
		ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield* this.runAsyncImplMock(ctx);
	}
}

const createMockContext = (agent: BaseAgent): InvocationContext =>
	({
		invocationId: "inv-base-heavy",
		agent,
		branch: "",
		endInvocation: false,
		session: {
			id: "ses-base",
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

describe("BaseAgent heavy matrix leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("name validation matrix", () => {
		it.each([
			"ok",
			"_private",
			"Agent_1",
			"A",
			"a1_b2_c3",
		])("accepts valid name %s", (name) => {
			expect(() => new TestAgent({ name })).not.toThrow();
		});

		it.each([
			"invalid-name",
			"1bad",
			"has space",
			"has.dot",
			"",
			"has-dash",
			"emoji😀",
		])("rejects invalid name %s", (name) => {
			expect(() => new TestAgent({ name })).toThrow(/invalid agent name/i);
		});

		it("rejects reserved user", () => {
			expect(() => new TestAgent({ name: "user" })).toThrow(
				"Agent name cannot be `user`",
			);
		});
	});

	describe("before/after callback matrices", () => {
		it("undefined callbacks run impl only", async () => {
			const agent = new TestAgent({ name: "no_cb" });
			const ctx = createMockContext(agent);
			const events: Event[] = [];
			for await (const event of agent.runAsync(ctx)) {
				events.push(event);
			}
			expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual(["impl"]);
			expect(agent.runAsyncImplMock).toHaveBeenCalledTimes(1);
		});

		it("single before callback content short-circuits impl and sets endInvocation", async () => {
			const agent = new TestAgent({
				name: "before_single",
				beforeAgentCallback: () => ({
					parts: [{ text: "before" }],
				}),
			});
			const ctx = createMockContext(agent);
			const events: Event[] = [];
			for await (const event of agent.runAsync(ctx)) {
				events.push(event);
			}
			expect(events).toHaveLength(1);
			expect(events[0].content?.parts?.[0]?.text).toBe("before");
			expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		});

		it("before callback array short-circuits on first defined content", async () => {
			const calls: string[] = [];
			const agent = new TestAgent({
				name: "before_arr",
				beforeAgentCallback: [
					() => {
						calls.push("a");
						return undefined;
					},
					() => {
						calls.push("b");
						return { parts: [{ text: "second" }] };
					},
					() => {
						calls.push("c");
						return { parts: [{ text: "third" }] };
					},
				],
			});
			const events: Event[] = [];
			for await (const event of agent.runAsync(createMockContext(agent))) {
				events.push(event);
			}
			expect(calls).toEqual(["a", "b"]);
			expect(events[0].content?.parts?.[0]?.text).toBe("second");
			expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		});

		it("before callback array all undefined continues to impl", async () => {
			const agent = new TestAgent({
				name: "before_all_undef",
				beforeAgentCallback: [() => undefined, async () => undefined],
			});
			const events: Event[] = [];
			for await (const event of agent.runAsync(createMockContext(agent))) {
				events.push(event);
			}
			expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual(["impl"]);
		});

		it("after callback yields content after impl", async () => {
			const agent = new TestAgent({
				name: "after_single",
				afterAgentCallback: () => ({ parts: [{ text: "after" }] }),
			});
			const events: Event[] = [];
			for await (const event of agent.runAsync(createMockContext(agent))) {
				events.push(event);
			}
			expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"impl",
				"after",
			]);
		});

		it("after callback array short-circuits on first defined", async () => {
			const agent = new TestAgent({
				name: "after_arr",
				afterAgentCallback: [
					() => undefined,
					() => ({ parts: [{ text: "a2" }] }),
					() => ({ parts: [{ text: "a3" }] }),
				],
			});
			const events: Event[] = [];
			for await (const event of agent.runAsync(createMockContext(agent))) {
				events.push(event);
			}
			expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"impl",
				"a2",
			]);
		});

		it("endInvocation after runAsyncImpl skips after callback", async () => {
			const after = vi.fn(() => ({ parts: [{ text: "after" }] }));
			const agent = new TestAgent({
				name: "end_after_impl",
				afterAgentCallback: after,
			});
			agent.runAsyncImplMock.mockImplementation(async function* (ctx) {
				ctx.endInvocation = true;
				yield new Event({
					author: agent.name,
					content: { parts: [{ text: "done" }] },
				});
			});
			const events: Event[] = [];
			for await (const event of agent.runAsync(createMockContext(agent))) {
				events.push(event);
			}
			expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual(["done"]);
			expect(after).not.toHaveBeenCalled();
		});

		it("plugin before callback override skips canonical callbacks", async () => {
			class OverridePlugin extends BasePlugin {
				async beforeAgentCallback(): Promise<any> {
					return { parts: [{ text: "plugin-before" }] };
				}
			}
			const agent = new TestAgent({
				name: "plugin_before",
				beforeAgentCallback: () => ({ parts: [{ text: "canonical" }] }),
			});
			const ctx = createMockContext(agent);
			ctx.pluginManager = new PluginManager({
				plugins: [new OverridePlugin("ovr")],
			});
			ctx.createChildContext = vi.fn((childAgent) => {
				const child = createMockContext(childAgent);
				child.pluginManager = ctx.pluginManager;
				return child;
			}) as InvocationContext["createChildContext"];
			const events: Event[] = [];
			for await (const event of agent.runAsync(ctx)) {
				events.push(event);
			}
			expect(events[0].content?.parts?.[0]?.text).toBe("plugin-before");
			expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		});
	});

	describe("tree / parent / live", () => {
		it("findAgent/findSubAgent traverse deep trees", () => {
			const leaf = new TestAgent({ name: "leaf" });
			const mid = new TestAgent({ name: "mid", subAgents: [leaf] });
			const root = new TestAgent({ name: "root", subAgents: [mid] });
			expect(root.findAgent("root")).toBe(root);
			expect(root.findAgent("mid")).toBe(mid);
			expect(root.findAgent("leaf")).toBe(leaf);
			expect(root.findSubAgent("leaf")).toBe(leaf);
			expect(root.findSubAgent("root")).toBeUndefined();
			expect(leaf.rootAgent).toBe(root);
		});

		it("throws when sub-agent already has a parent", () => {
			const child = new TestAgent({ name: "owned" });
			new TestAgent({ name: "first_parent", subAgents: [child] });
			expect(
				() => new TestAgent({ name: "second_parent", subAgents: [child] }),
			).toThrow(/already has a parent agent/);
		});

		it("runLive mirrors before short-circuit and after yield", async () => {
			const agent = new TestAgent({
				name: "live_path",
				beforeAgentCallback: () => undefined,
				afterAgentCallback: () => ({ parts: [{ text: "live-after" }] }),
			});
			const events: Event[] = [];
			for await (const event of agent.runLive(createMockContext(agent))) {
				events.push(event);
			}
			expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"impl",
				"live-after",
			]);
		});

		it("canonical before/after agent callbacks undefined/single/array", () => {
			const single = () => undefined;
			const arr = [single, single];
			const none = new TestAgent({ name: "cb_none" });
			const one = new TestAgent({
				name: "cb_one",
				beforeAgentCallback: single,
				afterAgentCallback: single,
			});
			const many = new TestAgent({
				name: "cb_many",
				beforeAgentCallback: arr,
				afterAgentCallback: arr,
			});
			expect(none.canonicalBeforeAgentCallbacks).toEqual([]);
			expect(none.canonicalAfterAgentCallbacks).toEqual([]);
			expect(one.canonicalBeforeAgentCallbacks).toEqual([single]);
			expect(one.canonicalAfterAgentCallbacks).toEqual([single]);
			expect(many.canonicalBeforeAgentCallbacks).toBe(arr);
			expect(many.canonicalAfterAgentCallbacks).toBe(arr);
		});

		it("abstract runAsyncImpl/runLiveImpl throw when not overridden", async () => {
			class Bare extends BaseAgent {}
			const bare = new Bare({ name: "bare" });
			await expect(async () => {
				for await (const _ of bare["runAsyncImpl"](createMockContext(bare))) {
				}
			}).rejects.toThrow(/runAsyncImpl for Bare is not implemented/);
			await expect(async () => {
				for await (const _ of bare["runLiveImpl"](createMockContext(bare))) {
				}
			}).rejects.toThrow(/runLiveImpl for Bare is not implemented/);
		});
	});
});
