import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import { InvocationContext } from "../../agents/invocation-context";
import {
	createBranchContextForSubAgent,
	mergeAgentRun,
	ParallelAgent,
} from "../../agents/parallel-agent";
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

function makeAgent(name: string): BaseAgent {
	return { name } as BaseAgent;
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
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent("root"),
		session: makeSession(),
		invocationId: "inv-1",
		branch,
	});
}

describe("createBranchContextForSubAgent", () => {
	it("builds branch from parent and sub-agent names when no parent branch", () => {
		const parent = new MockSubAgent("parent");
		const child = new MockSubAgent("child");
		const ctx = makeContext();

		const branched = createBranchContextForSubAgent(parent, child, ctx);

		expect(branched.branch).toBe("parent.child");
		expect(branched.agent).toBe(child);
		expect(branched.invocationId).toBe(ctx.invocationId);
		expect(branched.session).toBe(ctx.session);
	});

	it("prefixes existing parent branch", () => {
		const parent = new MockSubAgent("parent");
		const child = new MockSubAgent("child");
		const ctx = makeContext("root.branch");

		const branched = createBranchContextForSubAgent(parent, child, ctx);

		expect(branched.branch).toBe("root.branch.parent.child");
		expect(branched.agent).toBe(child);
	});
});

describe("mergeAgentRun", () => {
	it("yields nothing for an empty generator list", async () => {
		const events: Event[] = [];
		for await (const event of mergeAgentRun([])) {
			events.push(event);
		}
		expect(events).toHaveLength(0);
	});

	it("yields all events from a single generator", async () => {
		const e1 = new Event({ author: "a" });
		const e2 = new Event({ author: "a" });

		async function* gen() {
			yield e1;
			yield e2;
		}

		const events: Event[] = [];
		for await (const event of mergeAgentRun([gen()])) {
			events.push(event);
		}
		expect(events).toEqual([e1, e2]);
	});

	it("interleaves events from multiple generators", async () => {
		const a1 = new Event({ author: "a1" });
		const a2 = new Event({ author: "a2" });
		const b1 = new Event({ author: "b1" });

		async function* genA() {
			yield a1;
			await new Promise((r) => setTimeout(r, 40));
			yield a2;
		}

		async function* genB() {
			await new Promise((r) => setTimeout(r, 10));
			yield b1;
		}

		const events: Event[] = [];
		for await (const event of mergeAgentRun([genA(), genB()])) {
			events.push(event);
		}

		expect(events).toHaveLength(3);
		expect(events).toContain(a1);
		expect(events).toContain(a2);
		expect(events).toContain(b1);
		expect(events.indexOf(a1)).toBeLessThan(events.indexOf(a2));
		expect(events.indexOf(a1)).toBeLessThan(events.indexOf(b1));
		expect(events.indexOf(b1)).toBeLessThan(events.indexOf(a2));
	});

	it("drops a failing generator and continues merging the rest", async () => {
		const ok1 = new Event({ author: "ok1" });
		const ok2 = new Event({ author: "ok2" });
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		async function* good() {
			yield ok1;
			await new Promise((r) => setTimeout(r, 15));
			yield ok2;
		}

		async function* bad() {
			await new Promise((r) => setTimeout(r, 5));
			throw new Error("parallel-gen-fail");
		}

		const events: Event[] = [];
		for await (const event of mergeAgentRun([good(), bad()])) {
			events.push(event);
		}

		expect(events).toEqual([ok1, ok2]);
		expect(errorSpy).toHaveBeenCalled();
		expect(
			errorSpy.mock.calls.some((call) =>
				String(call[0]).includes("Error in parallel agent"),
			),
		).toBe(true);
		errorSpy.mockRestore();
	});

	it("keeps merging when one generator finishes early", async () => {
		const early = new Event({ author: "early" });
		const late1 = new Event({ author: "late1" });
		const late2 = new Event({ author: "late2" });

		async function* shortGen() {
			yield early;
		}

		async function* longGen() {
			await new Promise((r) => setTimeout(r, 10));
			yield late1;
			await new Promise((r) => setTimeout(r, 10));
			yield late2;
		}

		const events: Event[] = [];
		for await (const event of mergeAgentRun([shortGen(), longGen()])) {
			events.push(event);
		}

		expect(events).toEqual([early, late1, late2]);
	});
});

describe("createBranchContextForSubAgent extras", () => {
	it("copies services, live queue, runConfig, and endInvocation onto the branch", () => {
		const parent = new MockSubAgent("parent");
		const child = new MockSubAgent("child");
		const artifactService = { kind: "artifacts" } as any;
		const memoryService = { kind: "memory" } as any;
		const liveRequestQueue = { kind: "live" } as any;
		const runConfig = { streamingMode: "sse" } as any;
		const activeStreamingTools = new Map();
		const transcriptionCache = [{ text: "hi" }] as any;

		const ctx = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("root"),
			session: makeSession(),
			invocationId: "inv-copy",
			artifactService,
			memoryService,
			liveRequestQueue,
			runConfig,
			activeStreamingTools,
			transcriptionCache,
			endInvocation: true,
			userContent: { role: "user", parts: [{ text: "q" }] } as any,
		});

		const branched = createBranchContextForSubAgent(parent, child, ctx);

		expect(branched.artifactService).toBe(artifactService);
		expect(branched.memoryService).toBe(memoryService);
		expect(branched.liveRequestQueue).toBe(liveRequestQueue);
		expect(branched.runConfig).toBe(runConfig);
		expect(branched.activeStreamingTools).toBe(activeStreamingTools);
		expect(branched.transcriptionCache).toBe(transcriptionCache);
		expect(branched.endInvocation).toBe(true);
		expect(branched.userContent).toEqual({
			role: "user",
			parts: [{ text: "q" }],
		});
		expect(branched.pluginManager).toBe(ctx.pluginManager);
		expect(branched.agent).toBe(child);
	});
});

describe("ParallelAgent", () => {
	let subAgent1: MockSubAgent;
	let subAgent2: MockSubAgent;

	beforeEach(() => {
		vi.clearAllMocks();
		subAgent1 = new MockSubAgent("subAgent1");
		subAgent2 = new MockSubAgent("subAgent2");
	});

	describe("Constructor", () => {
		it("should initialize properties correctly from config", () => {
			const agent = new ParallelAgent({
				name: "parallel",
				description: "A parallel agent",
				subAgents: [subAgent1, subAgent2],
			});

			expect(agent.name).toBe("parallel");
			expect(agent.description).toBe("A parallel agent");
			expect(agent.subAgents).toEqual([subAgent1, subAgent2]);
		});
	});

	describe("runAsyncImpl", () => {
		it("should run subagents with branched contexts and merge events", async () => {
			const agent = new ParallelAgent({
				name: "parallel",
				description: "desc",
				subAgents: [subAgent1, subAgent2],
			});

			const event1 = new Event({ author: "subAgent1" });
			const event2 = new Event({ author: "subAgent2" });
			const ctx = makeContext();

			subAgent1.runAsync.mockImplementation(async function* () {
				yield event1;
			});
			subAgent2.runAsync.mockImplementation(async function* () {
				yield event2;
			});

			const yieldedEvents: Event[] = [];
			for await (const event of agent["runAsyncImpl"](ctx)) {
				yieldedEvents.push(event);
			}

			expect(subAgent1.runAsync).toHaveBeenCalledTimes(1);
			expect(subAgent2.runAsync).toHaveBeenCalledTimes(1);

			const branch1 = subAgent1.runAsync.mock.calls[0][0] as InvocationContext;
			const branch2 = subAgent2.runAsync.mock.calls[0][0] as InvocationContext;
			expect(branch1.branch).toBe("parallel.subAgent1");
			expect(branch2.branch).toBe("parallel.subAgent2");
			expect(yieldedEvents).toContain(event1);
			expect(yieldedEvents).toContain(event2);
		});

		it("yields nothing for empty subAgents", async () => {
			const agent = new ParallelAgent({
				name: "parallel_empty",
				description: "desc",
				subAgents: [],
			});
			const events: Event[] = [];
			for await (const event of agent["runAsyncImpl"](makeContext())) {
				events.push(event);
			}
			expect(events).toHaveLength(0);
		});

		it("runs a single sub-agent without hanging", async () => {
			const agent = new ParallelAgent({
				name: "parallel_one",
				description: "desc",
				subAgents: [subAgent1],
			});
			const only = new Event({ author: "subAgent1" });
			subAgent1.runAsync.mockImplementation(async function* () {
				yield only;
			});

			const events: Event[] = [];
			for await (const event of agent["runAsyncImpl"](makeContext())) {
				events.push(event);
			}
			expect(events).toEqual([only]);
			expect(subAgent1.runAsync).toHaveBeenCalledTimes(1);
		});

		it("continues merging when one sub-agent run rejects", async () => {
			const agent = new ParallelAgent({
				name: "parallel_err",
				description: "desc",
				subAgents: [subAgent1, subAgent2],
			});
			const ok = new Event({ author: "subAgent2" });
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			subAgent1.runAsync.mockImplementation(
				// biome-ignore lint/correctness/useYield: throws before yielding
				async function* () {
					throw new Error("sub1-failed");
				},
			);
			subAgent2.runAsync.mockImplementation(async function* () {
				await new Promise((r) => setTimeout(r, 10));
				yield ok;
			});

			const events: Event[] = [];
			for await (const event of agent["runAsyncImpl"](makeContext())) {
				events.push(event);
			}

			expect(events).toEqual([ok]);
			expect(errorSpy).toHaveBeenCalled();
			errorSpy.mockRestore();
		});
	});

	describe("runLiveImpl", () => {
		it("should throw an error because it is not supported", async () => {
			const agent = new ParallelAgent({
				name: "parallel",
				description: "desc",
			});

			const generator = agent["runLiveImpl"](makeContext());

			await expect(() => generator.next()).rejects.toThrow(
				"This is not supported yet for ParallelAgent.",
			);
		});
	});
});
