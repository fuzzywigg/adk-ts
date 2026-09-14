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

class MockSubAgent extends BaseAgent {
	runAsync = vi.fn();
	runLive = vi.fn();

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

describe("LoopAgent heavy matrix leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("treats maxIterations 0 as unbounded because !0 is true", async () => {
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
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(calls).toBe(3);
	});

	it("stops after maxIterations when no escalate", async () => {
		const sub = new MockSubAgent("bounded");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "bounded" });
		});
		const agent = new LoopAgent({
			name: "bounded",
			description: "desc",
			subAgents: [sub],
			maxIterations: 2,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(sub.runAsync).toHaveBeenCalledTimes(2);
		expect(events).toHaveLength(2);
	});

	it("escalates mid-stream after yielding prior events", async () => {
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

	it("runs each sub-agent once per iteration", async () => {
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
		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			authors.push(event.author);
		}
		expect(authors).toEqual(["a", "b"]);
	});

	it("runLiveImpl throws not supported", async () => {
		const agent = new LoopAgent({
			name: "live",
			description: "desc",
			subAgents: [],
		});
		await expect(async () => {
			for await (const _ of agent["runLiveImpl"](mockContext)) {
			}
		}).rejects.toThrow(/not supported/i);
	});

	it("does not stop when escalate is false or missing", async () => {
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
		expect(events).toHaveLength(4);
	});
});

describe("ParallelAgent heavy matrix leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("createBranchContextForSubAgent nests branch suffixes", () => {
		const parent = new MockSubAgent("parent");
		const child = new MockSubAgent("child");
		const rooted = {
			...mockContext,
			branch: "root",
		} as InvocationContext;
		const branched = createBranchContextForSubAgent(parent, child, rooted);
		expect(branched.branch).toBe("root.parent.child");
		expect(branched.agent).toBe(child);
		expect(branched.invocationId).toBe(mockContext.invocationId);
	});

	it("createBranchContextForSubAgent starts branch when empty", () => {
		const parent = new MockSubAgent("parent");
		const child = new MockSubAgent("child");
		const branched = createBranchContextForSubAgent(parent, child, mockContext);
		expect(branched.branch).toBe("parent.child");
	});

	it("mergeAgentRun yields nothing for empty generator list", async () => {
		const events: Event[] = [];
		for await (const event of mergeAgentRun([])) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("mergeAgentRun interleaves events from multiple generators", async () => {
		async function* a() {
			yield new Event({ author: "a", content: { parts: [{ text: "1" }] } });
			yield new Event({ author: "a", content: { parts: [{ text: "2" }] } });
		}
		async function* b() {
			yield new Event({ author: "b", content: { parts: [{ text: "x" }] } });
		}
		const authors: string[] = [];
		for await (const event of mergeAgentRun([a(), b()])) {
			authors.push(event.author);
		}
		expect(authors.sort()).toEqual(["a", "a", "b"].sort());
		expect(authors).toHaveLength(3);
	});

	it("mergeAgentRun continues after a generator error", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		// biome-ignore lint/correctness/useYield: throws before yielding
		async function* bad() {
			throw new Error("boom");
		}
		async function* good() {
			yield new Event({ author: "good" });
		}
		const authors: string[] = [];
		for await (const event of mergeAgentRun([bad(), good()])) {
			authors.push(event.author);
		}
		expect(authors).toContain("good");
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});

	it("runAsyncImpl merges sub-agent event streams", async () => {
		const a = new MockSubAgent("a");
		const b = new MockSubAgent("b");
		a.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "a" });
		});
		b.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "b" });
		});
		const agent = new ParallelAgent({
			name: "par",
			description: "desc",
			subAgents: [a, b],
		});
		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			authors.push(event.author);
		}
		expect(authors.sort()).toEqual(["a", "b"]);
	});
});

describe("SequentialAgent heavy matrix leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("runs sub-agents in order and yields their events", async () => {
		const a = new MockSubAgent("a");
		const b = new MockSubAgent("b");
		a.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "a" });
		});
		b.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "b" });
		});
		const agent = new SequentialAgent({
			name: "seq",
			description: "desc",
			subAgents: [a, b],
		});
		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			authors.push(event.author);
		}
		expect(authors).toEqual(["a", "b"]);
		expect(a.runAsync).toHaveBeenCalledTimes(1);
		expect(b.runAsync).toHaveBeenCalledTimes(1);
	});

	it("yields nothing when there are no sub-agents", async () => {
		const agent = new SequentialAgent({
			name: "empty",
			description: "desc",
			subAgents: [],
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("runLiveImpl injects taskCompleted into LlmAgent tools once", async () => {
		const llm = new LlmAgent({
			name: "llm_child",
			description: "child",
			instruction: "base",
			tools: [],
		});
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "llm_child" });
		}) as any;

		const agent = new SequentialAgent({
			name: "seq_live",
			description: "desc",
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
			llm.tools.filter((t) =>
				typeof t === "function"
					? t.name === "taskCompleted"
					: t.name === "taskCompleted",
			),
		).toHaveLength(1);
	});

	it("runLiveImpl skips non-LlmAgent sub-agents for tool injection", async () => {
		const plain = new MockSubAgent("plain");
		plain.runLive.mockImplementation(async function* () {
			yield new Event({ author: "plain" });
		});
		const agent = new SequentialAgent({
			name: "seq",
			description: "desc",
			subAgents: [plain],
		});
		const events: Event[] = [];
		for await (const event of agent["runLiveImpl"](mockContext)) {
			events.push(event);
		}
		expect(events.map((e) => e.author)).toEqual(["plain"]);
		expect((plain as any).tools).toBeUndefined();
	});
});
