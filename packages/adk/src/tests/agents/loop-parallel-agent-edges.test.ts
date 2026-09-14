import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { LoopAgent } from "../../agents/loop-agent";
import {
	createBranchContextForSubAgent,
	mergeAgentRun,
	ParallelAgent,
} from "../../agents/parallel-agent";
import { Event } from "../../events/event";

class MockSubAgent extends BaseAgent {
	runAsync = vi.fn();

	constructor(name: string) {
		super({ name, description: "" });
	}
}

const mockContext: InvocationContext = {
	invocationId: "test-inv-id",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-123",
		userId: "user-123",
		appName: "test-app",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	createChildContext: vi.fn(function (this: InvocationContext, child) {
		return {
			...this,
			agent: child,
			branch: this.branch ? `${this.branch}.${child.name}` : child.name,
		} as InvocationContext;
	}),
} as unknown as InvocationContext;

describe("LoopAgent leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("treats maxIterations: 0 as unbounded because !0 is true", async () => {
		const sub = new MockSubAgent("looper");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			if (calls >= 3) {
				yield new Event({
					author: "looper",
					actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				});
				return;
			}
			yield new Event({ author: "looper" });
		});

		const agent = new LoopAgent({
			name: "zero_max",
			description: "desc",
			subAgents: [sub],
			maxIterations: 0,
		});

		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(calls).toBe(3);
		expect(events.at(-1)?.actions?.escalate).toBe(true);
	});

	it("does not stop when escalate is missing or false", async () => {
		const sub = new MockSubAgent("no_esc");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "no_esc", actions: undefined as any });
			yield new Event({
				author: "no_esc",
				actions: { escalate: false, stateDelta: {}, artifactDelta: {} },
			});
		});

		const agent = new LoopAgent({
			name: "cont",
			description: "desc",
			subAgents: [sub],
			maxIterations: 2,
		});

		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(sub.runAsync).toHaveBeenCalledTimes(2);
		expect(events).toHaveLength(4);
	});

	it("stops mid-stream after yielding prior events when escalate arrives", async () => {
		const sub = new MockSubAgent("mid");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "mid", content: { parts: [{ text: "a" }] } });
			yield new Event({
				author: "mid",
				actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				content: { parts: [{ text: "stop" }] },
			});
			yield new Event({
				author: "mid",
				content: { parts: [{ text: "never" }] },
			});
		});

		const agent = new LoopAgent({
			name: "mid_stop",
			description: "desc",
			subAgents: [sub],
			maxIterations: 5,
		});

		const texts: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			texts.push(event.content?.parts?.[0]?.text as string);
		}
		expect(texts).toEqual(["a", "stop"]);
	});

	it("with maxIterations: 1 runs each sub-agent once", async () => {
		const a = new MockSubAgent("a");
		const b = new MockSubAgent("b");
		a.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "a" });
		});
		b.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "b" });
		});

		const agent = new LoopAgent({
			name: "once",
			description: "desc",
			subAgents: [a, b],
			maxIterations: 1,
		});

		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(a.runAsync).toHaveBeenCalledTimes(1);
		expect(b.runAsync).toHaveBeenCalledTimes(1);
	});
});

describe("ParallelAgent leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("logs console.error with generator index when a run fails", async () => {
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		async function* ok() {
			yield new Event({ author: "ok" });
		}
		// biome-ignore lint/correctness/useYield: throws before yielding
		async function* bad() {
			throw new Error("parallel boom");
		}

		const events: Event[] = [];
		for await (const event of mergeAgentRun([ok(), bad()])) {
			events.push(event);
		}
		expect(events.map((e) => e.author)).toEqual(["ok"]);
		expect(error).toHaveBeenCalledWith(
			"Error in parallel agent 1:",
			expect.any(Error),
		);
		error.mockRestore();
	});

	it("yields nothing and does not hang when all generators reject", async () => {
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		// biome-ignore lint/correctness/useYield: throws before yielding
		async function* bad1() {
			throw new Error("a");
		}
		// biome-ignore lint/correctness/useYield: throws before yielding
		async function* bad2() {
			throw new Error("b");
		}

		const events: Event[] = [];
		for await (const event of mergeAgentRun([bad1(), bad2()])) {
			events.push(event);
		}
		expect(events).toEqual([]);
		expect(error).toHaveBeenCalledTimes(2);
		error.mockRestore();
	});

	it("createBranchContextForSubAgent copies pluginManager and sets branch", () => {
		const parent = new ParallelAgent({
			name: "parent_par",
			description: "p",
		});
		const child = new MockSubAgent("child_par");
		const pluginManager = { id: "pm" } as any;
		const ctx = {
			...mockContext,
			branch: "root",
			pluginManager,
			artifactService: undefined,
			sessionService: {} as any,
			memoryService: undefined,
			userContent: undefined,
		} as InvocationContext;

		const branched = createBranchContextForSubAgent(parent, child, ctx);
		expect(branched.branch).toBe("root.parent_par.child_par");
		expect(branched.pluginManager).toBe(pluginManager);
		expect(branched.agent).toBe(child);
	});

	it("uses agent.subAgent suffix when parent branch is empty", () => {
		const parent = new ParallelAgent({
			name: "parent_par",
			description: "p",
		});
		const child = new MockSubAgent("solo");
		const branched = createBranchContextForSubAgent(parent, child, {
			...mockContext,
			branch: "",
			sessionService: {} as any,
		} as InvocationContext);
		expect(branched.branch).toBe("parent_par.solo");
	});

	it("ParallelAgent with omitted subAgents yields nothing", async () => {
		const agent = new ParallelAgent({
			name: "empty_par",
			description: "d",
		});
		expect(agent.subAgents).toEqual([]);
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("drains surviving generators when the middle one fails", async () => {
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		async function* a() {
			yield new Event({ author: "a", content: { parts: [{ text: "1" }] } });
			yield new Event({ author: "a", content: { parts: [{ text: "2" }] } });
		}
		// biome-ignore lint/correctness/useYield: throws before yielding
		async function* b() {
			throw new Error("mid");
		}
		async function* c() {
			yield new Event({ author: "c", content: { parts: [{ text: "c1" }] } });
		}

		const authors: string[] = [];
		for await (const event of mergeAgentRun([a(), b(), c()])) {
			authors.push(event.author);
		}
		expect(authors).toEqual(expect.arrayContaining(["a", "a", "c"]));
		expect(authors).not.toContain("b");
		error.mockRestore();
	});
});
