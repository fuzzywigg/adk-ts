import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../agents/base-agent";
import type { InvocationContext } from "../agents/invocation-context";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

class StubBaseAgent extends BaseAgent {
	protected async *runAsyncImpl(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({
			author: this.name,
			content: { role: "model", parts: [{ text: `from-${this.name}` }] },
		});
	}
}

describe("Runner leftover edges (post #124)", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;
	let runner: Runner;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new Runner({
			appName: "runner-edges-app",
			agent,
			sessionService,
		});
	});

	it("sync run drains empty when runAsync yields nothing and completes", async () => {
		await sessionService.createSession(
			"runner-edges-app",
			"u1",
			{},
			"s-empty-sync",
		);
		let asyncDone = false;
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			asyncDone = true;
			yield* [] as AsyncIterable<Event>;
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-empty-sync",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		});

		await vi.waitFor(() => {
			expect(asyncDone).toBe(true);
		});

		const events = [...generator];
		expect(events).toEqual([]);
	});

	it("sync run yields events after async side completes", async () => {
		await sessionService.createSession(
			"runner-edges-app",
			"u1",
			{},
			"s-busy-sync",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			await new Promise((r) => setTimeout(r, 5));
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "late" }] },
			});
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-busy-sync",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		});

		await vi.waitFor(async () => {
			const session = await sessionService.getSession(
				"runner-edges-app",
				"u1",
				"s-busy-sync",
			);
			expect(
				session?.events.some(
					(e) =>
						e.author === "root_agent" && e.content?.parts?.[0]?.text === "late",
				),
			).toBe(true);
		});

		const events = [...generator];
		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("late");
	});

	it("_findAgentToRun uses findAgent when last event is a function response", () => {
		const toolAgent = new LlmAgent({
			name: "tool_agent",
			model: "gemini-2.0-flash-exp",
		});
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [toolAgent],
		});
		runner = new Runner({
			appName: "runner-edges-app",
			agent,
			sessionService,
		});

		const session = {
			id: "s-fr-find",
			userId: "u1",
			appName: "runner-edges-app",
			state: {},
			lastUpdateTime: 0,
			events: [
				new Event({
					author: "tool_agent",
					content: {
						role: "model",
						parts: [
							{
								functionCall: {
									id: "call_edges_1",
									name: "lookup",
									args: {},
								},
							},
						],
					},
				}),
				new Event({
					author: "user",
					content: {
						role: "user",
						parts: [
							{
								functionResponse: {
									id: "call_edges_1",
									name: "lookup",
									response: { ok: true },
								},
							},
						],
					},
				}),
			],
		} as Session;

		const findAgentSpy = vi.spyOn(agent, "findAgent");
		const chosen = (runner as any)._findAgentToRun(session, agent);
		expect(findAgentSpy).toHaveBeenCalledWith("tool_agent");
		expect(chosen).toBe(toolAgent);
	});

	it("_findAgentToRun treats missing session.events as empty via || []", () => {
		const session = {
			id: "s-no-events",
			userId: "u1",
			appName: "runner-edges-app",
			state: {},
			lastUpdateTime: 0,
		} as Session;

		const chosen = (runner as any)._findAgentToRun(session, agent);
		expect(chosen).toBe(agent);
	});

	it("_newInvocationContext uses null userContent when newMessage is omitted", () => {
		const session = {
			id: "s-null-msg",
			userId: "u1",
			appName: "runner-edges-app",
			state: {},
			events: [],
			lastUpdateTime: 0,
		} as Session;

		const ctx = (runner as any)._newInvocationContext(session, {});
		expect(ctx.userContent).toBeNull();
	});

	it("_findAgentToRun falls back to root when function-call author is unknown", async () => {
		const session = await sessionService.createSession(
			"runner-edges-app",
			"u1",
			{},
			"s-unknown-author",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "ghost_agent",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "call_ghost",
								name: "x",
								args: {},
							},
						},
					],
				},
			}),
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "call_ghost",
								name: "x",
								response: {},
							},
						},
					],
				},
			}),
		);

		const chosen = (runner as any)._findAgentToRun(session, agent);
		expect(chosen).toBeUndefined();
	});

	it("routes to StubBaseAgent via findAgent early return for function responses", () => {
		const remote = new StubBaseAgent({ name: "remote_a2a" });
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [remote as any],
		});
		runner = new Runner({
			appName: "runner-edges-app",
			agent,
			sessionService,
		});

		const session = {
			id: "s-stub-fr",
			userId: "u1",
			appName: "runner-edges-app",
			state: {},
			lastUpdateTime: 0,
			events: [
				new Event({
					author: "remote_a2a",
					content: {
						role: "model",
						parts: [
							{
								functionCall: {
									id: "call_remote",
									name: "cred",
									args: {},
								},
							},
						],
					},
				}),
				new Event({
					author: "user",
					content: {
						role: "user",
						parts: [
							{
								functionResponse: {
									id: "call_remote",
									name: "cred",
									response: { token: "x" },
								},
							},
						],
					},
				}),
			],
		} as Session;

		const chosen = (runner as any)._findAgentToRun(session, agent);
		expect(chosen).toBe(remote);
	});
});
