import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent, type SingleAgentCallback } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { Event } from "../../events/event";
import { telemetryService } from "../../telemetry";

vi.mock("../../telemetry", () => ({
	telemetryService: {
		traceAsyncGenerator: vi.fn((_name, gen) => gen),
	},
}));

class EdgeAgent extends BaseAgent {
	runAsyncImplMock = vi.fn(async function* (
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({
			author: this.name,
			content: { parts: [{ text: "async" }] },
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

function createMockContext(agent: BaseAgent): InvocationContext {
	return {
		invocationId: "inv-edge",
		agent,
		branch: "root",
		endInvocation: false,
		session: {
			id: "ses-edge",
			userId: "user-edge",
			appName: "edge-app",
			state: {},
			events: [],
			lastUpdateTime: 0,
		} as any,
		createChildContext: vi.fn(function (this: InvocationContext, childAgent) {
			const child = createMockContext(childAgent);
			child.pluginManager = this.pluginManager;
			child.branch = this.branch
				? `${this.branch}.${childAgent.name}`
				: childAgent.name;
			return child;
		}) as any,
	} as InvocationContext;
}

describe("BaseAgent leftover edges", () => {
	let agent: EdgeAgent;
	let mockContext: InvocationContext;

	beforeEach(() => {
		agent = new EdgeAgent({ name: "edge_agent" });
		mockContext = createMockContext(agent);
		vi.clearAllMocks();
	});

	describe("name validation matrix", () => {
		it.each([
			["a"],
			["Z"],
			["_"],
			["_x"],
			["agent_1"],
			["A_b_C_9"],
			["__dunder__"],
			["constructor"],
		])("accepts valid identifier %#: %s", (name) => {
			expect(() => new EdgeAgent({ name })).not.toThrow();
			expect(new EdgeAgent({ name }).name).toBe(name);
		});

		it.each([
			["", "Found invalid agent name"],
			["1abc", "Found invalid agent name"],
			["-dash", "Found invalid agent name"],
			["has-dash", "Found invalid agent name"],
			["has space", "Found invalid agent name"],
			["dot.name", "Found invalid agent name"],
			["name!", "Found invalid agent name"],
			["user", "Agent name cannot be `user`"],
		])("rejects %#: %s", (name, fragment) => {
			expect(() => new EdgeAgent({ name })).toThrow(fragment);
		});
	});

	describe("constructor defaults and parent wiring", () => {
		it("defaults description to empty string and subAgents to []", () => {
			const a = new EdgeAgent({ name: "solo" });
			expect(a.description).toBe("");
			expect(a.subAgents).toEqual([]);
			expect(a.parentAgent).toBeUndefined();
			expect(a.beforeAgentCallback).toBeUndefined();
			expect(a.afterAgentCallback).toBeUndefined();
		});

		it("wires parentAgent for every sub-agent in order", () => {
			const left = new EdgeAgent({ name: "left" });
			const right = new EdgeAgent({ name: "right" });
			const parent = new EdgeAgent({
				name: "parent",
				subAgents: [left, right],
			});
			expect(left.parentAgent).toBe(parent);
			expect(right.parentAgent).toBe(parent);
			expect(parent.parentAgent).toBeUndefined();
			expect(parent.subAgents).toEqual([left, right]);
		});

		it("keeps rootAgent as self when parentAgent is undefined", () => {
			const leaf = new EdgeAgent({ name: "leaf_only" });
			expect(leaf.rootAgent).toBe(leaf);
		});

		it("does not re-wire parent when subAgents array is mutated after construct", () => {
			const orphan = new EdgeAgent({ name: "orphan" });
			const parent = new EdgeAgent({ name: "mut_parent" });
			parent.subAgents.push(orphan);
			expect(orphan.parentAgent).toBeUndefined();
			expect(parent.findSubAgent("orphan")).toBe(orphan);
		});

		it("reports exact dual-parent error text with both parent names", () => {
			const child = new EdgeAgent({ name: "shared_child" });
			new EdgeAgent({ name: "first_parent", subAgents: [child] });
			expect(
				() => new EdgeAgent({ name: "second_parent", subAgents: [child] }),
			).toThrow(
				"Agent `shared_child` already has a parent agent, current parent: `first_parent`, trying to add: `second_parent`",
			);
		});
	});

	describe("findAgent / findSubAgent leftovers", () => {
		it("returns self from findAgent even when a descendant shares no match", () => {
			const child = new EdgeAgent({ name: "kid" });
			const root = new EdgeAgent({ name: "me", subAgents: [child] });
			expect(root.findAgent("me")).toBe(root);
			expect(root.findSubAgent("me")).toBeUndefined();
		});

		it("searches siblings left-to-right and returns the first DFS hit", () => {
			const aLeaf = new EdgeAgent({ name: "target" });
			const a = new EdgeAgent({ name: "branch_a", subAgents: [aLeaf] });
			const bLeaf = new EdgeAgent({ name: "other" });
			const b = new EdgeAgent({ name: "branch_b", subAgents: [bLeaf] });
			const root = new EdgeAgent({ name: "tree", subAgents: [a, b] });

			expect(root.findAgent("target")).toBe(aLeaf);
			expect(root.findAgent("other")).toBe(bLeaf);
			expect(root.findSubAgent("branch_a")).toBe(a);
			expect(root.findSubAgent("branch_b")).toBe(b);
			expect(a.findAgent("other")).toBeUndefined();
			expect(b.findSubAgent("target")).toBeUndefined();
		});

		it("returns undefined for empty trees and deep misses", () => {
			const empty = new EdgeAgent({ name: "empty_tree" });
			expect(empty.findSubAgent("x")).toBeUndefined();
			expect(empty.findAgent("x")).toBeUndefined();
			expect(empty.findAgent("empty_tree")).toBe(empty);
		});

		it("finds nested agents across uneven depths", () => {
			const deep = new EdgeAgent({ name: "deep_leaf" });
			const mid = new EdgeAgent({ name: "mid", subAgents: [deep] });
			const shallow = new EdgeAgent({ name: "shallow_leaf" });
			const root = new EdgeAgent({
				name: "uneven",
				subAgents: [shallow, mid],
			});
			expect(root.findAgent("deep_leaf")).toBe(deep);
			expect(root.findAgent("shallow_leaf")).toBe(shallow);
			expect(mid.findSubAgent("deep_leaf")).toBe(deep);
			expect(shallow.findSubAgent("deep_leaf")).toBeUndefined();
		});
	});

	describe("runAsync / runLive defaults and endInvocation", () => {
		it("runAsync and runLive default paths yield impl events when no callbacks", async () => {
			const asyncEvents: Event[] = [];
			for await (const event of agent.runAsync(mockContext)) {
				asyncEvents.push(event);
			}
			const liveEvents: Event[] = [];
			for await (const event of agent.runLive(mockContext)) {
				liveEvents.push(event);
			}
			expect(asyncEvents).toHaveLength(1);
			expect(liveEvents).toHaveLength(1);
			expect(asyncEvents[0].content?.parts?.[0]).toEqual({ text: "async" });
			expect(liveEvents[0].content?.parts?.[0]).toEqual({ text: "live" });
			expect(telemetryService.traceAsyncGenerator).toHaveBeenCalledWith(
				"agent_run [edge_agent]",
				expect.anything(),
			);
			expect(telemetryService.traceAsyncGenerator).toHaveBeenCalledWith(
				"agent_run_live [edge_agent]",
				expect.anything(),
			);
		});

		it("runAsync skips after callback when impl sets endInvocation", async () => {
			const afterCb = vi.fn(() => ({ parts: [{ text: "after" }] }));
			agent.afterAgentCallback = afterCb;
			agent.runAsyncImplMock.mockImplementation(async function* (ctx) {
				yield new Event({ author: this.name });
				ctx.endInvocation = true;
			});

			const events: Event[] = [];
			for await (const event of agent["runAsyncInternal"](mockContext)) {
				events.push(event);
			}
			expect(afterCb).not.toHaveBeenCalled();
			expect(events).toHaveLength(1);
		});

		it("runLive still runs after callback even if impl sets endInvocation", async () => {
			const afterCb = vi.fn(() => ({ parts: [{ text: "live-after" }] }));
			agent.afterAgentCallback = afterCb;
			agent.runLiveImplMock.mockImplementation(async function* (ctx) {
				yield new Event({ author: this.name });
				ctx.endInvocation = true;
			});

			const events: Event[] = [];
			for await (const event of agent["runLiveInternal"](mockContext)) {
				events.push(event);
			}
			expect(afterCb).toHaveBeenCalledOnce();
			expect(events).toHaveLength(2);
			expect(events[1].content).toEqual({ parts: [{ text: "live-after" }] });
		});

		it("passes this agent into createChildContext for both run paths", async () => {
			for await (const _ of agent.runAsync(mockContext)) {
			}
			for await (const _ of agent.runLive(mockContext)) {
			}
			expect(mockContext.createChildContext).toHaveBeenCalledWith(agent);
			expect(mockContext.createChildContext).toHaveBeenCalledTimes(2);
		});

		it("throws default runAsyncImpl / runLiveImpl errors from bare BaseAgent", async () => {
			class Bare extends BaseAgent {}
			const bare = new Bare({ name: "bare_agent" });
			await expect(bare["runAsyncImpl"](mockContext).next()).rejects.toThrow(
				"runAsyncImpl for Bare is not implemented.",
			);
			await expect(bare["runLiveImpl"](mockContext).next()).rejects.toThrow(
				"runLiveImpl for Bare is not implemented.",
			);
		});
	});

	describe("callback list and plugin leftovers", () => {
		it("skips remaining before callbacks after a Promise content return", async () => {
			const cb1 = vi.fn(async () => undefined);
			const cb2 = vi.fn(async () => ({ parts: [{ text: "promise-hit" }] }));
			const cb3 = vi.fn(() => ({ parts: [{ text: "never" }] }));
			agent.beforeAgentCallback = [cb1, cb2, cb3];

			const events: Event[] = [];
			for await (const event of agent["runAsyncInternal"](mockContext)) {
				events.push(event);
			}
			expect(cb1).toHaveBeenCalledOnce();
			expect(cb2).toHaveBeenCalledOnce();
			expect(cb3).not.toHaveBeenCalled();
			expect(events[0].content).toEqual({ parts: [{ text: "promise-hit" }] });
			expect(mockContext.endInvocation).toBe(true);
		});

		it("uses plugin before content and still sets endInvocation", async () => {
			const agentCb = vi.fn(() => ({ parts: [{ text: "agent" }] }));
			agent.beforeAgentCallback = agentCb;
			mockContext.pluginManager = {
				runBeforeAgentCallback: vi.fn(async () => ({
					parts: [{ text: "plugin" }],
				})),
				runAfterAgentCallback: vi.fn(async () => undefined),
			} as any;

			const events: Event[] = [];
			for await (const event of agent["runAsyncInternal"](mockContext)) {
				events.push(event);
			}
			expect(agentCb).not.toHaveBeenCalled();
			expect(events).toHaveLength(1);
			expect(events[0].author).toBe("edge_agent");
			expect(events[0].branch).toBe("root");
			expect(mockContext.endInvocation).toBe(true);
		});

		it("canonicalAfterAgentCallbacks stops at first content in after list", async () => {
			const a1: SingleAgentCallback = vi.fn(() => undefined);
			const a2: SingleAgentCallback = vi.fn(() => ({
				parts: [{ text: "second" }],
			}));
			const a3: SingleAgentCallback = vi.fn(() => ({
				parts: [{ text: "third" }],
			}));
			agent.afterAgentCallback = [a1, a2, a3];

			const events: Event[] = [];
			for await (const event of agent["runAsyncInternal"](mockContext)) {
				events.push(event);
			}
			expect(a1).toHaveBeenCalledOnce();
			expect(a2).toHaveBeenCalledOnce();
			expect(a3).not.toHaveBeenCalled();
			expect(events.at(-1)?.content).toEqual({ parts: [{ text: "second" }] });
		});

		it("before content event carries callbackContext eventActions", async () => {
			agent.beforeAgentCallback = (ctx) => {
				ctx.state.flag = true;
				return { parts: [{ text: "with-delta" }] };
			};
			const events: Event[] = [];
			for await (const event of agent["runAsyncInternal"](mockContext)) {
				events.push(event);
			}
			expect(events).toHaveLength(1);
			expect(events[0].actions.stateDelta.flag).toBe(true);
			expect(events[0].content).toEqual({ parts: [{ text: "with-delta" }] });
		});
	});
});
