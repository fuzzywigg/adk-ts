import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import {
	_findFunctionCallEventIfLastEventIsFunctionResponse,
	Runner,
} from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

const mockSession = (
	events: (Event | null | undefined)[] | null | undefined,
): Session =>
	({
		id: "s-heavy",
		userId: "u-heavy",
		appName: "runner-app",
		state: {},
		events,
		lastUpdateTime: 0,
	}) as Session;

describe("Runner heavy matrix leftover edges", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	describe("_findFunctionCallEventIfLastEventIsFunctionResponse matrix", () => {
		it.each([
			{ label: "undefined events", events: undefined },
			{ label: "null events", events: null },
			{ label: "empty events", events: [] },
		])("returns null for $label", ({ events }) => {
			expect(
				_findFunctionCallEventIfLastEventIsFunctionResponse(
					mockSession(events as any),
				),
			).toBeNull();
		});

		it("returns undefined when last event has no functionResponse part", () => {
			const session = mockSession([
				new Event({
					author: "user",
					content: { parts: [{ text: "hi" }] },
				}),
			]);
			expect(
				_findFunctionCallEventIfLastEventIsFunctionResponse(session),
			).toBeNull();
		});

		it("returns null when functionResponse has no id", () => {
			const session = mockSession([
				new Event({
					author: "user",
					content: {
						parts: [
							{
								functionResponse: {
									name: "tool",
									response: {},
								} as any,
							},
						],
					},
				}),
			]);
			expect(
				_findFunctionCallEventIfLastEventIsFunctionResponse(session),
			).toBeNull();
		});

		it("finds matching functionCall by id scanning backwards", () => {
			const call = new Event({
				author: "tool_agent",
				content: {
					role: "model",
					parts: [
						{
							functionCall: { id: "c1", name: "lookup", args: {} },
						},
					],
				},
			});
			const noise = new Event({
				author: "other",
				content: { parts: [{ text: "mid" }] },
			});
			const response = new Event({
				author: "user",
				content: {
					parts: [
						{
							functionResponse: {
								id: "c1",
								name: "lookup",
								response: { ok: true },
							},
						},
					],
				},
			});
			expect(
				_findFunctionCallEventIfLastEventIsFunctionResponse(
					mockSession([call, noise, response]),
				),
			).toBe(call);
		});

		it("returns null when no matching functionCall id exists", () => {
			const response = new Event({
				author: "user",
				content: {
					parts: [
						{
							functionResponse: {
								id: "missing",
								name: "lookup",
								response: {},
							},
						},
					],
				},
			});
			expect(
				_findFunctionCallEventIfLastEventIsFunctionResponse(
					mockSession([response]),
				),
			).toBeNull();
		});
	});

	describe("_findAgentToRun matrix", () => {
		it("unknown author in non-FR history falls back to root", () => {
			const root = new LlmAgent({
				name: "root_agent",
				model: "gemini-2.0-flash-exp",
			});
			const runner = new Runner({
				appName: "runner-app",
				agent: root,
				sessionService,
			});
			const chosen = (runner as any)._findAgentToRun(
				mockSession([
					new Event({
						author: "ghost",
						content: { parts: [{ text: "?" }] },
					}),
				]),
				root,
			);
			expect(chosen).toBe(root);
		});

		it("missing FR call author resolves to undefined via findAgent", () => {
			const root = new LlmAgent({
				name: "root_agent",
				model: "gemini-2.0-flash-exp",
			});
			const runner = new Runner({
				appName: "runner-app",
				agent: root,
				sessionService,
			});
			const call = new Event({
				author: "ghost",
				content: {
					parts: [{ functionCall: { id: "fx", name: "t", args: {} } }],
				},
			});
			const response = new Event({
				author: "user",
				content: {
					parts: [{ functionResponse: { id: "fx", name: "t", response: {} } }],
				},
			});
			expect(
				(runner as any)._findAgentToRun(mockSession([call, response]), root),
			).toBeUndefined();
		});

		it.each([
			{
				label: "root author → root",
				author: "root_agent",
				expectChild: false,
			},
			{
				label: "known transferable child → child",
				author: "child_agent",
				expectChild: true,
			},
		])("$label", ({ author, expectChild }) => {
			const child = new LlmAgent({
				name: "child_agent",
				model: "gemini-2.0-flash-exp",
			});
			const root = new LlmAgent({
				name: "root_agent",
				model: "gemini-2.0-flash-exp",
				subAgents: [child],
			});
			const runner = new Runner({
				appName: "runner-app",
				agent: root,
				sessionService,
			});
			const call = new Event({
				author,
				content: {
					role: "model",
					parts: [{ functionCall: { id: "fx", name: "t", args: {} } }],
				},
			});
			const response = new Event({
				author: "user",
				content: {
					parts: [
						{
							functionResponse: { id: "fx", name: "t", response: {} },
						},
					],
				},
			});
			const chosen = (runner as any)._findAgentToRun(
				mockSession([call, response]),
				root,
			);
			expect(chosen).toBe(expectChild ? child : root);
		});

		it("non-transferable function-call author still selected via early return", () => {
			const locked = new LlmAgent({
				name: "locked_agent",
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
			const call = new Event({
				author: "locked_agent",
				content: {
					role: "model",
					parts: [{ functionCall: { id: "L1", name: "t", args: {} } }],
				},
			});
			const response = new Event({
				author: "user",
				content: {
					parts: [
						{
							functionResponse: { id: "L1", name: "t", response: {} },
						},
					],
				},
			});
			expect(
				(runner as any)._findAgentToRun(mockSession([call, response]), root),
			).toBe(locked);
		});
	});

	describe("rewind / invocation context matrix", () => {
		it("rewind throws when invocation id missing", async () => {
			await sessionService.createSession("runner-app", "u1", {}, "s-rw");
			const runner = new Runner({
				appName: "runner-app",
				agent: new LlmAgent({
					name: "root_agent",
					model: "gemini-2.0-flash-exp",
				}),
				sessionService,
			});
			await expect(
				runner.rewind({
					userId: "u1",
					sessionId: "s-rw",
					rewindBeforeInvocationId: "nope",
				}),
			).rejects.toThrow(/Invocation ID not found/);
		});

		it("_newInvocationContext coalesces omitted newMessage to null userContent", () => {
			const runner = new Runner({
				appName: "runner-app",
				agent: new LlmAgent({
					name: "root_agent",
					model: "gemini-2.0-flash-exp",
				}),
				sessionService,
			});
			const ctx = (runner as any)._newInvocationContext(mockSession([]), {});
			expect(ctx.userContent).toBeNull();
		});

		it("_computeStateDeltaForRewind restores prior keys and nulls post-rewind keys", async () => {
			const runner = new Runner({
				appName: "runner-app",
				agent: new LlmAgent({
					name: "root_agent",
					model: "gemini-2.0-flash-exp",
				}),
				sessionService,
			});
			const before = new Event({
				author: "root_agent",
				invocationId: "inv-a",
				actions: { stateDelta: { keep: 1, gone: 2 }, artifactDelta: {} },
			});
			const after = new Event({
				author: "root_agent",
				invocationId: "inv-b",
				actions: {
					stateDelta: { keep: 9, added: 3 },
					artifactDelta: {},
				},
			});
			const session = mockSession([before, after]);
			session.state = { keep: 9, gone: 2, added: 3 };
			const delta = await (runner as any)._computeStateDeltaForRewind(
				session,
				1,
			);
			expect(delta.keep).toBe(1);
			expect(delta.gone).toBeUndefined();
			expect(delta.added).toBeNull();
		});
	});
});
