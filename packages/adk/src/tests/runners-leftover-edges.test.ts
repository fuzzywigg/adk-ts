import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

const createMockSession = (
	events: (Event | null)[] | null | undefined,
): Session =>
	({
		id: `s-${Math.random()}`,
		userId: `u-${Math.random()}`,
		events,
	}) as Session;

describe("Runner leftover edges", () => {
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
			appName: "runner-app",
			agent,
			sessionService,
		});
	});

	it("_findAgentToRun routes via findAgent(author) when last event is function response", () => {
		const child = new LlmAgent({
			name: "tool_agent",
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		runner = new Runner({
			appName: "runner-app",
			agent: root,
			sessionService,
		});

		const callEvent = new Event({
			author: "tool_agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "call_edge",
							name: "lookup",
							args: {},
						},
					},
				],
			},
		});
		const responseEvent = new Event({
			author: "user",
			content: {
				parts: [
					{
						functionResponse: {
							id: "call_edge",
							name: "lookup",
							response: { ok: true },
						},
					},
				],
			},
		});
		const session = createMockSession([callEvent, responseEvent]);

		const chosen = (runner as any)._findAgentToRun(session, root);
		expect(chosen).toBe(child);
		expect(chosen.name).toBe("tool_agent");
	});

	it("_findAgentToRun treats undefined/null session.events as empty via || []", () => {
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new Runner({
			appName: "runner-app",
			agent: root,
			sessionService,
		});

		expect(
			(runner as any)._findAgentToRun(createMockSession(undefined), root),
		).toBe(root);
		expect((runner as any)._findAgentToRun(createMockSession(null), root)).toBe(
			root,
		);
	});

	it("_newInvocationContext sets userContent null when newMessage is omitted or undefined", () => {
		const session = createMockSession([]);

		const withoutMessage = (runner as any)._newInvocationContext(session, {});
		expect(withoutMessage.userContent).toBeNull();

		const withUndefined = (runner as any)._newInvocationContext(session, {
			newMessage: undefined,
		});
		expect(withUndefined.userContent).toBeNull();
	});

	it("sync run drains when runAsync yields nothing (empty queue + sentinel)", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-empty-drain");
		const runAsyncSpy = vi
			.spyOn(runner, "runAsync")
			.mockImplementation(async function* () {
				// yield nothing — queue only gets the null sentinel in finally
			});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-empty-drain",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		});

		await vi.waitFor(() => {
			expect(runAsyncSpy).toHaveBeenCalled();
		});
		// Allow the async IIFE finally to push null and set asyncCompleted
		await Promise.resolve();
		await Promise.resolve();

		const events = [...generator];
		expect(events).toEqual([]);
		runAsyncSpy.mockRestore();
	});

	it("matrix: findAgent returns agent; unknown author falls through; root author; transferable subagent", () => {
		const child = new LlmAgent({
			name: "child_agent",
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		runner = new Runner({
			appName: "runner-app",
			agent: root,
			sessionService,
		});

		const find = (events: Event[]) =>
			(runner as any)._findAgentToRun(createMockSession(events), root);

		expect(
			find([
				new Event({
					author: "child_agent",
					content: { role: "model", parts: [{ text: "from-child" }] },
				}),
			]),
		).toBe(child);

		expect(
			find([
				new Event({
					author: "ghost_agent",
					content: { role: "model", parts: [{ text: "unknown" }] },
				}),
			]),
		).toBe(root);

		expect(
			find([
				new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "from-root" }] },
				}),
			]),
		).toBe(root);

		expect(
			find([
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "hi" }] },
				}),
				new Event({
					author: "child_agent",
					content: { role: "model", parts: [{ text: "transferable" }] },
				}),
			]),
		).toBe(child);
	});

	it("matrix continues past unknown then picks earlier transferable subagent", () => {
		const child = new LlmAgent({
			name: "child_agent",
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		runner = new Runner({
			appName: "runner-app",
			agent: root,
			sessionService,
		});

		const chosen = (runner as any)._findAgentToRun(
			createMockSession([
				new Event({
					author: "child_agent",
					content: { role: "model", parts: [{ text: "earlier" }] },
				}),
				new Event({
					author: "ghost_agent",
					content: { role: "model", parts: [{ text: "later-unknown" }] },
				}),
			]),
			root,
		);
		expect(chosen).toBe(child);
	});
});
