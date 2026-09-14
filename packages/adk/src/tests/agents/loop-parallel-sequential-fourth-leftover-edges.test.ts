import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { LlmAgent } from "../../agents/llm-agent";
import { LoopAgent } from "../../agents/loop-agent";
import {
	createBranchContextForSubAgent,
	mergeAgentRun,
	ParallelAgent,
} from "../../agents/parallel-agent";
import { SequentialAgent } from "../../agents/sequential-agent";
import { Event } from "../../events/event";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";

class MockSubAgent extends BaseAgent {
	runAsync = vi.fn();
	runLive = vi.fn();

	constructor(name: string) {
		super({ name, description: "" });
	}
}

const mockContext: InvocationContext = {
	invocationId: "fourth-loop-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop",
		userId: "user-loop",
		appName: "app-loop",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	sessionService: {} as BaseSessionService,
	pluginManager: new PluginManager(),
	createChildContext: vi.fn(function (this: InvocationContext, child) {
		return {
			...this,
			agent: child,
			branch: this.branch ? `${this.branch}.${child.name}` : child.name,
		} as InvocationContext;
	}),
} as unknown as InvocationContext;

describe("LoopAgent fourth leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("runs unbounded until escalate when maxIterations omitted", async () => {
		const sub = new MockSubAgent("unbounded");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			if (calls >= 4) {
				yield new Event({
					author: "unbounded",
					actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				});
				return;
			}
			yield new Event({ author: "unbounded" });
		});
		const agent = new LoopAgent({
			name: "omit_max",
			description: "d",
			subAgents: [sub],
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(calls).toBe(4);
	});

	it("stops at maxIterations without escalate", async () => {
		const sub = new MockSubAgent("capped");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "capped" });
		});
		const agent = new LoopAgent({
			name: "capped_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 3,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(sub.runAsync).toHaveBeenCalledTimes(3);
		expect(events).toHaveLength(3);
	});

	it("escalates from the second sub-agent mid iteration", async () => {
		const a = new MockSubAgent("a");
		const b = new MockSubAgent("b");
		a.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "a" });
		});
		b.runAsync.mockImplementation(async function* () {
			yield new Event({
				author: "b",
				actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
			});
		});
		const agent = new LoopAgent({
			name: "mid_sub_esc",
			description: "d",
			subAgents: [a, b],
			maxIterations: 5,
		});
		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			authors.push(event.author);
		}
		expect(authors).toEqual(["a", "b"]);
		expect(a.runAsync).toHaveBeenCalledTimes(1);
		expect(b.runAsync).toHaveBeenCalledTimes(1);
	});

	it("treats escalate undefined/false as continue", async () => {
		const sub = new MockSubAgent("cont");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "cont", actions: undefined as any });
			yield new Event({
				author: "cont",
				actions: { escalate: false, stateDelta: {}, artifactDelta: {} },
			});
		});
		const agent = new LoopAgent({
			name: "continue_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 2,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(events).toHaveLength(4);
	});

	it("yields nothing when subAgents empty", async () => {
		const agent = new LoopAgent({
			name: "empty_loop",
			description: "d",
			subAgents: [],
			maxIterations: 5,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("runLiveImpl throws not supported", async () => {
		const agent = new LoopAgent({
			name: "live_loop",
			description: "d",
		});
		await expect(async () => {
			for await (const _ of agent["runLiveImpl"](mockContext)) {
			}
		}).rejects.toThrow(/not supported yet for LoopAgent/);
	});
});

describe("ParallelAgent fourth leftover edges — merge / branch", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("mergeAgentRun yields nothing for empty generator list", async () => {
		const events: Event[] = [];
		for await (const event of mergeAgentRun([])) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("mergeAgentRun interleaves events from multiple generators", async () => {
		async function* g1() {
			yield new Event({ author: "g1", content: { parts: [{ text: "1" }] } });
			yield new Event({ author: "g1", content: { parts: [{ text: "2" }] } });
		}
		async function* g2() {
			yield new Event({ author: "g2", content: { parts: [{ text: "a" }] } });
		}
		const authors: string[] = [];
		for await (const event of mergeAgentRun([g1(), g2()])) {
			authors.push(event.author);
		}
		expect(authors.sort()).toEqual(["g1", "g1", "g2"].sort());
	});

	it("mergeAgentRun continues after one generator errors", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		async function* ok() {
			yield new Event({ author: "ok" });
		}
		// biome-ignore lint/correctness/useYield: throws before yielding
		async function* bad() {
			throw new Error("merge fail");
		}
		const events: Event[] = [];
		for await (const event of mergeAgentRun([bad(), ok()])) {
			events.push(event);
		}
		expect(events.map((e) => e.author)).toEqual(["ok"]);
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});

	it("createBranchContextForSubAgent builds nested branch suffixes", () => {
		const parent = new ParallelAgent({
			name: "parent_par",
			description: "d",
		});
		const child = new MockSubAgent("child_par");
		const ctx = {
			...mockContext,
			branch: "root",
			agent: parent,
		} as InvocationContext;
		const branched = createBranchContextForSubAgent(parent, child, ctx);
		expect(branched.branch).toBe("root.parent_par.child_par");
		expect(branched.agent).toBe(child);
		expect(branched.invocationId).toBe(ctx.invocationId);
	});

	it("createBranchContextForSubAgent starts branch when parent branch empty", () => {
		const parent = new ParallelAgent({
			name: "par_root",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const branched = createBranchContextForSubAgent(parent, child, mockContext);
		expect(branched.branch).toBe("par_root.leaf");
	});

	it("runAsyncImpl merges branched sub-agent runs", async () => {
		const a = new MockSubAgent("pa");
		const b = new MockSubAgent("pb");
		a.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "pa" });
		});
		b.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "pb" });
		});
		const agent = new ParallelAgent({
			name: "par_run",
			description: "d",
			subAgents: [a, b],
		});
		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			authors.push(event.author);
		}
		expect(authors.sort()).toEqual(["pa", "pb"]);
		expect(a.runAsync).toHaveBeenCalledOnce();
		expect(b.runAsync).toHaveBeenCalledOnce();
	});

	it("runAsyncImpl yields nothing with empty subAgents", async () => {
		const agent = new ParallelAgent({
			name: "par_empty",
			description: "d",
			subAgents: [],
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("runLiveImpl throws not supported", async () => {
		const agent = new ParallelAgent({
			name: "par_live",
			description: "d",
		});
		await expect(async () => {
			for await (const _ of agent["runLiveImpl"](mockContext)) {
			}
		}).rejects.toThrow(/not supported yet for ParallelAgent/);
	});
});

describe("SequentialAgent fourth leftover edges — order", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("preserves declaration order across multiple events per agent", async () => {
		const first = new MockSubAgent("first");
		const second = new MockSubAgent("second");
		const order: string[] = [];
		first.runAsync.mockImplementation(async function* () {
			order.push("first-1");
			yield new Event({ author: "first" });
			order.push("first-2");
			yield new Event({ author: "first" });
		});
		second.runAsync.mockImplementation(async function* () {
			order.push("second");
			yield new Event({ author: "second" });
		});
		const agent = new SequentialAgent({
			name: "ordered",
			description: "d",
			subAgents: [first, second],
		});
		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			authors.push(event.author);
		}
		expect(order).toEqual(["first-1", "first-2", "second"]);
		expect(authors).toEqual(["first", "first", "second"]);
	});

	it("runLiveImpl injects taskCompleted tool once onto LlmAgent children", async () => {
		const llm = new LlmAgent({
			name: "live_seq_child",
			model: "gemini-2.5-flash",
			instruction: "base",
		});
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "live_seq_child" });
		}) as any;
		const agent = new SequentialAgent({
			name: "live_seq",
			description: "d",
			subAgents: [llm],
		});
		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		const toolNames = llm.tools.map((t) =>
			typeof t === "function" ? t.name : t.name,
		);
		expect(toolNames).toContain("taskCompleted");
		expect(llm.instruction).toContain("taskCompleted");

		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(
			llm.tools.filter(
				(t) => (typeof t === "function" ? t.name : t.name) === "taskCompleted",
			),
		).toHaveLength(1);
	});

	it("runLiveImpl skips non-LlmAgent children for tool injection", async () => {
		const plain = new MockSubAgent("plain_live");
		plain.runLive.mockImplementation(async function* () {
			yield new Event({ author: "plain_live" });
		});
		const agent = new SequentialAgent({
			name: "plain_seq",
			description: "d",
			subAgents: [plain],
		});
		const events: Event[] = [];
		for await (const event of agent["runLiveImpl"](mockContext)) {
			events.push(event);
		}
		expect(events.map((e) => e.author)).toEqual(["plain_live"]);
	});

	it("runAsyncImpl with single agent yields its events only", async () => {
		const only = new MockSubAgent("only");
		only.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "only", content: { parts: [{ text: "x" }] } });
		});
		const agent = new SequentialAgent({
			name: "single_seq",
			description: "d",
			subAgents: [only],
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("x");
	});
});
