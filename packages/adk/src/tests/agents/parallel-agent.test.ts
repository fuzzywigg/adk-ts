import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	ParallelAgent,
	createBranchContextForSubAgent,
	mergeAgentRun,
} from "../../agents/parallel-agent";
import { BaseAgent } from "../../agents/base-agent";
import { InvocationContext } from "../../agents/invocation-context";
import { PluginManager } from "../../plugins/plugin-manager";
import { Event } from "../../events/event";
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

	it("isolates generator errors so other agents continue", async () => {
		const ok = new Event({ author: "ok" });
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		async function* genOk() {
			await new Promise((r) => setTimeout(r, 20));
			yield ok;
		}

		async function* genFail() {
			await Promise.reject(new Error("parallel boom"));
			yield undefined as never;
		}

		const events: Event[] = [];
		for await (const event of mergeAgentRun([genFail(), genOk()])) {
			events.push(event);
		}

		expect(events).toEqual([ok]);
		expect(errorSpy).toHaveBeenCalled();
		errorSpy.mockRestore();
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

		it("yields nothing when there are no subAgents", async () => {
			const agent = new ParallelAgent({
				name: "parallel",
				description: "desc",
				subAgents: [],
			});

			const yieldedEvents: Event[] = [];
			for await (const event of agent["runAsyncImpl"](makeContext())) {
				yieldedEvents.push(event);
			}
			expect(yieldedEvents).toEqual([]);
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
