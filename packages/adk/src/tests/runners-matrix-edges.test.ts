import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import {
	_findFunctionCallEventIfLastEventIsFunctionResponse,
	Runner,
} from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

describe("Runner matrix edges (TOKENMAXX leftovers)", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
	});

	it("selects a non-transferable function-call author via the FR early return", async () => {
		const locked = new LlmAgent({
			name: "locked_tool_agent",
			model: "gemini-2.0-flash-exp",
			disallowTransferToParent: true,
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [locked],
		});
		const runner = new Runner({
			appName: "runner-app",
			agent: root,
			sessionService,
		});

		const session = await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			"s-fr-locked",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "locked_tool_agent",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "call_locked_1",
								name: "lookup",
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
								id: "call_locked_1",
								name: "lookup",
								response: { ok: true },
							},
						},
					],
				},
			}),
		);

		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(session)?.author,
		).toBe("locked_tool_agent");

		const withoutFr = {
			...session,
			events: session.events.slice(0, -1),
		} as Session;
		expect((runner as any)._findAgentToRun(withoutFr, root)).toBe(root);
		expect((runner as any)._findAgentToRun(session, root)).toBe(locked);
	});

	it.each([
		{ label: "undefined events", events: undefined },
		{ label: "null events", events: null },
	])("_findAgentToRun treats $label as empty non-user history", ({
		events,
	}) => {
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new Runner({
			appName: "runner-app",
			agent: root,
			sessionService,
		});
		const session = { id: "s", userId: "u", events } as Session;

		expect((runner as any)._findAgentToRun(session, root)).toBe(root);
	});

	it.each([
		{ label: "undefined", newMessage: undefined },
		{ label: "null", newMessage: null },
		{ label: "empty string", newMessage: "" as any },
	])("_newInvocationContext coalesces $label newMessage to null userContent", ({
		newMessage,
	}) => {
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new Runner({
			appName: "runner-app",
			agent: root,
			sessionService,
		});
		const session = {
			id: "s",
			userId: "u",
			events: [],
		} as Session;

		const ctx = (runner as any)._newInvocationContext(session, {
			newMessage,
		});
		expect(ctx.userContent).toBeNull();
	});

	it("sync run drains an empty runAsync completion without yielding events", async () => {
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new Runner({
			appName: "runner-app",
			agent: root,
			sessionService,
		});
		await sessionService.createSession("runner-app", "u1", {}, "s-empty-sync");

		let runAsyncFinished = false;
		vi.spyOn(root, "runAsync").mockImplementation(async function* () {
			runAsyncFinished = true;
			yield* [] as AsyncIterable<Event>;
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-empty-sync",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		});

		await vi.waitFor(() => {
			expect(runAsyncFinished).toBe(true);
		});

		expect([...generator]).toEqual([]);
	});
});
