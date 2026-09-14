import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { InvocationContext as InvocationContextClass } from "../../agents/invocation-context";
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
import type { Session } from "../../sessions/session";

class MockSubAgent extends BaseAgent {
	runAsync = vi.fn();
	runLive = vi.fn();

	constructor(name: string) {
		super({ name, description: "" });
	}
}

function makeSession(): Session {
	return {
		id: "session-1",
		appName: "app",
		userId: "user-1",
		state: {},
		events: [],
	} as Session;
}

function makeContext(branch?: string): InvocationContext {
	return new InvocationContextClass({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: { name: "root" } as BaseAgent,
		session: makeSession(),
		invocationId: "inv-1",
		branch,
	});
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

describe("LoopAgent heavy matrix", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		1, 2, 3, 5,
	])("runs exactly %s iterations when no escalate", async (maxIterations) => {
		const sub = new MockSubAgent("looper");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "looper" });
		});
		const agent = new LoopAgent({
			name: "loop",
			description: "d",
			subAgents: [sub],
			maxIterations,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(sub.runAsync).toHaveBeenCalledTimes(maxIterations);
		expect(events).toHaveLength(maxIterations);
	});

	it("escalates on first sibling and skips later siblings in that iteration", async () => {
		const a = new MockSubAgent("a");
		const b = new MockSubAgent("b");
		const c = new MockSubAgent("c");
		a.runAsync.mockImplementation(async function* () {
			yield new Event({
				author: "a",
				actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
			});
		});
		b.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "b" });
		});
		c.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "c" });
		});
		const agent = new LoopAgent({
			name: "loop",
			description: "d",
			subAgents: [a, b, c],
			maxIterations: 4,
		});
		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			authors.push(event.author);
		}
		expect(authors).toEqual(["a"]);
		expect(b.runAsync).not.toHaveBeenCalled();
		expect(c.runAsync).not.toHaveBeenCalled();
	});

	it("completes full iteration of siblings then escalates next round", async () => {
		const a = new MockSubAgent("a");
		const b = new MockSubAgent("b");
		let aCalls = 0;
		a.runAsync.mockImplementation(async function* () {
			aCalls++;
			if (aCalls === 2) {
				yield new Event({
					author: "a",
					actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				});
				return;
			}
			yield new Event({ author: "a" });
		});
		b.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "b" });
		});
		const agent = new LoopAgent({
			name: "loop",
			description: "d",
			subAgents: [a, b],
			maxIterations: 10,
		});
		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			authors.push(event.author);
		}
		expect(authors).toEqual(["a", "b", "a"]);
		expect(a.runAsync).toHaveBeenCalledTimes(2);
		expect(b.runAsync).toHaveBeenCalledTimes(1);
	});

	it("yields multiple events per iteration before escalate", async () => {
		const sub = new MockSubAgent("multi");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "multi", content: { parts: [{ text: "1" }] } });
			yield new Event({ author: "multi", content: { parts: [{ text: "2" }] } });
			yield new Event({
				author: "multi",
				actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				content: { parts: [{ text: "3" }] },
			});
		});
		const agent = new LoopAgent({
			name: "loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 3,
		});
		const texts: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			texts.push(event.content?.parts?.[0]?.text as string);
		}
		expect(texts).toEqual(["1", "2", "3"]);
		expect(sub.runAsync).toHaveBeenCalledTimes(1);
	});

	it("empty subAgents with maxIterations yields nothing", async () => {
		const agent = new LoopAgent({
			name: "empty",
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

	it("runLiveImpl always rejects for LoopAgent", async () => {
		const agent = new LoopAgent({ name: "live", description: "d" });
		await expect(() =>
			agent["runLiveImpl"](mockContext).next(),
		).rejects.toThrow(/not supported yet for LoopAgent/);
	});

	it("stores undefined maxIterations when omitted", () => {
		const agent = new LoopAgent({ name: "u", description: "d" });
		expect(agent.maxIterations).toBeUndefined();
	});

	it("continues when escalate is falsy across mixed action shapes", async () => {
		const sub = new MockSubAgent("mix");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			yield new Event({ author: "mix", actions: undefined as any });
			yield new Event({
				author: "mix",
				actions: { escalate: false, stateDelta: {}, artifactDelta: {} },
			});
		});
		const agent = new LoopAgent({
			name: "loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 2,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(calls).toBe(2);
		expect(events).toHaveLength(4);
	});
});

describe("ParallelAgent mergeAgentRun / createBranchContext heavy matrix", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("mergeAgentRun yields nothing for empty list", async () => {
		const events: Event[] = [];
		for await (const event of mergeAgentRun([])) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it.each([
		1, 2, 4,
	])("mergeAgentRun drains %s sequential single-event generators", async (count) => {
		const gens = Array.from({ length: count }, (_, i) => {
			async function* gen() {
				yield new Event({ author: `g${i}` });
			}
			return gen();
		});
		const authors: string[] = [];
		for await (const event of mergeAgentRun(gens)) {
			authors.push(event.author);
		}
		expect(authors.sort()).toEqual(
			Array.from({ length: count }, (_, i) => `g${i}`).sort(),
		);
	});

	it("mergeAgentRun continues after first generator fails mid-stream", async () => {
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		async function* good() {
			yield new Event({ author: "ok", content: { parts: [{ text: "1" }] } });
			await new Promise((r) => setTimeout(r, 5));
			yield new Event({ author: "ok", content: { parts: [{ text: "2" }] } });
		}
		async function* bad() {
			yield new Event({ author: "bad" });
			throw new Error("after one");
		}
		const authors: string[] = [];
		for await (const event of mergeAgentRun([good(), bad()])) {
			authors.push(event.author);
		}
		expect(authors.filter((a) => a === "ok")).toEqual(["ok", "ok"]);
		expect(authors).toContain("bad");
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});

	it("createBranchContextForSubAgent nests under existing branch", () => {
		const parent = new ParallelAgent({ name: "par", description: "p" });
		const child = new MockSubAgent("kid");
		const branched = createBranchContextForSubAgent(
			parent,
			child,
			makeContext("root.mid"),
		);
		expect(branched.branch).toBe("root.mid.par.kid");
		expect(branched.agent).toBe(child);
	});

	it("createBranchContextForSubAgent uses parent.child when branch empty", () => {
		const parent = new ParallelAgent({ name: "par", description: "p" });
		const child = new MockSubAgent("kid");
		const branched = createBranchContextForSubAgent(
			parent,
			child,
			makeContext(),
		);
		expect(branched.branch).toBe("par.kid");
	});

	it("createBranchContextForSubAgent copies endInvocation and userContent", () => {
		const parent = new ParallelAgent({ name: "par", description: "p" });
		const child = new MockSubAgent("kid");
		const ctx = new InvocationContextClass({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: { name: "root" } as BaseAgent,
			session: makeSession(),
			invocationId: "inv-copy",
			endInvocation: true,
			userContent: { role: "user", parts: [{ text: "q" }] } as any,
		});
		const branched = createBranchContextForSubAgent(parent, child, ctx);
		expect(branched.endInvocation).toBe(true);
		expect(branched.userContent).toEqual({
			role: "user",
			parts: [{ text: "q" }],
		});
		expect(branched.invocationId).toBe("inv-copy");
	});

	it("ParallelAgent runAsyncImpl branches each sub-agent", async () => {
		const a = new MockSubAgent("a");
		const b = new MockSubAgent("b");
		a.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "a" });
		});
		b.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "b" });
		});
		const agent = new ParallelAgent({
			name: "parallel",
			description: "d",
			subAgents: [a, b],
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](makeContext("top"))) {
			events.push(event);
		}
		expect(events.map((e) => e.author).sort()).toEqual(["a", "b"]);
		expect((a.runAsync.mock.calls[0][0] as InvocationContext).branch).toBe(
			"top.parallel.a",
		);
		expect((b.runAsync.mock.calls[0][0] as InvocationContext).branch).toBe(
			"top.parallel.b",
		);
	});

	it("ParallelAgent runLiveImpl rejects", async () => {
		const agent = new ParallelAgent({ name: "p", description: "d" });
		await expect(() =>
			agent["runLiveImpl"](makeContext()).next(),
		).rejects.toThrow(/not supported yet for ParallelAgent/);
	});

	it("ParallelAgent with single empty-yielding sub-agent yields nothing", async () => {
		const a = new MockSubAgent("a");
		a.runAsync.mockImplementation(async function* () {});
		const agent = new ParallelAgent({
			name: "p",
			description: "d",
			subAgents: [a],
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](makeContext())) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("mergeAgentRun finishes when short generators complete first", async () => {
		async function* short() {
			yield new Event({ author: "short" });
		}
		async function* long() {
			await new Promise((r) => setTimeout(r, 8));
			yield new Event({ author: "long1" });
			await new Promise((r) => setTimeout(r, 8));
			yield new Event({ author: "long2" });
		}
		const authors: string[] = [];
		for await (const event of mergeAgentRun([short(), long()])) {
			authors.push(event.author);
		}
		expect(authors).toEqual(["short", "long1", "long2"]);
	});
});

describe("SequentialAgent heavy matrix", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("runs four sub-agents in strict order", async () => {
		const subs = [0, 1, 2, 3].map((i) => new MockSubAgent(`s${i}`));
		for (const sub of subs) {
			sub.runAsync.mockImplementation(async function* () {
				yield new Event({ author: sub.name });
			});
		}
		const agent = new SequentialAgent({
			name: "seq",
			description: "d",
			subAgents: subs,
		});
		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			authors.push(event.author);
		}
		expect(authors).toEqual(["s0", "s1", "s2", "s3"]);
		for (let i = 0; i < 3; i++) {
			expect(subs[i].runAsync.mock.invocationCallOrder[0]).toBeLessThan(
				subs[i + 1].runAsync.mock.invocationCallOrder[0],
			);
		}
	});

	it("omitted subAgents defaults to empty and yields nothing", async () => {
		const agent = new SequentialAgent({ name: "seq", description: "d" });
		expect(agent.subAgents).toEqual([]);
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("forwards the same context to each runAsync call", async () => {
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
			description: "d",
			subAgents: [a, b],
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(a.runAsync).toHaveBeenCalledWith(mockContext);
		expect(b.runAsync).toHaveBeenCalledWith(mockContext);
	});

	it("yields multiple events from one sub-agent before the next", async () => {
		const a = new MockSubAgent("a");
		const b = new MockSubAgent("b");
		a.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "a1" });
			yield new Event({ author: "a2" });
		});
		b.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "b1" });
		});
		const agent = new SequentialAgent({
			name: "seq",
			description: "d",
			subAgents: [a, b],
		});
		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			authors.push(event.author);
		}
		expect(authors).toEqual(["a1", "a2", "b1"]);
	});

	it("injects taskCompleted into LlmAgent children on runLive", async () => {
		const llm = new LlmAgent({
			name: "llm",
			description: "d",
			instruction: "Base.",
			tools: [],
		});
		llm.runLive = vi.fn().mockImplementation(async function* () {
			yield new Event({ author: "llm" });
		});
		const plain = new MockSubAgent("plain");
		plain.runLive.mockImplementation(async function* () {
			yield new Event({ author: "plain" });
		});
		const agent = new SequentialAgent({
			name: "seq",
			description: "d",
			subAgents: [llm, plain],
		});
		const authors: string[] = [];
		for await (const event of agent["runLiveImpl"](mockContext)) {
			authors.push(event.author);
		}
		expect(authors).toEqual(["llm", "plain"]);
		expect(llm.tools).toHaveLength(1);
		expect(llm.instruction).toContain("taskCompleted");
		expect(plain.runLive).toHaveBeenCalledWith(mockContext);
	});

	it("does not re-inject taskCompleted when function already present", async () => {
		function taskCompleted(): string {
			return "Task completion signaled.";
		}
		const llm = new LlmAgent({
			name: "llm",
			description: "d",
			instruction: "Keep.",
			tools: [taskCompleted],
		});
		llm.runLive = vi.fn().mockImplementation(async function* () {
			yield new Event({ author: "llm" });
		});
		const agent = new SequentialAgent({
			name: "seq",
			description: "d",
			subAgents: [llm],
		});
		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(llm.tools).toHaveLength(1);
		expect(llm.instruction).toBe("Keep.");
	});

	it("runLive with empty subAgents yields nothing", async () => {
		const agent = new SequentialAgent({
			name: "seq",
			description: "d",
			subAgents: [],
		});
		const events: Event[] = [];
		for await (const event of agent["runLiveImpl"](mockContext)) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("continues after a silent middle agent on runAsync", async () => {
		const a = new MockSubAgent("a");
		const b = new MockSubAgent("b");
		const c = new MockSubAgent("c");
		a.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "a" });
		});
		b.runAsync.mockImplementation(async function* () {});
		c.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "c" });
		});
		const agent = new SequentialAgent({
			name: "seq",
			description: "d",
			subAgents: [a, b, c],
		});
		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			authors.push(event.author);
		}
		expect(authors).toEqual(["a", "c"]);
		expect(b.runAsync).toHaveBeenCalledTimes(1);
	});

	it("constructor stores name description and subAgents", () => {
		const a = new MockSubAgent("a");
		const agent = new SequentialAgent({
			name: "seq_name",
			description: "seq_desc",
			subAgents: [a],
		});
		expect(agent.name).toBe("seq_name");
		expect(agent.description).toBe("seq_desc");
		expect(agent.subAgents).toEqual([a]);
	});
});
