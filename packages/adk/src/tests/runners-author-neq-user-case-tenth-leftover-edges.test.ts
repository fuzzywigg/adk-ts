import { beforeEach, describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

/**
 * Tenth leftover: `_findAgentToRun` filters with `e.author !== "user"` (exact).
 * Near-miss authors `User` / `USER` stay in non-user history and can route via
 * `findSubAgent` — distinct from auth/shared-memory author case (#174/#175).
 */
describe("Runner author !== user case-sensitivity tenth leftover (post #176)", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
	});

	function makeRunner(root: LlmAgent): Runner {
		return new Runner({
			appName: "runner-author-case-app",
			agent: root,
			sessionService,
		});
	}

	function sessionWith(events: Event[]): Session {
		return {
			id: "s-author-case",
			userId: "u1",
			appName: "runner-author-case-app",
			state: {},
			events,
			lastUpdateTime: 0,
		} as Session;
	}

	it.each([
		"User",
		"USER",
	] as const)('author %j !== "user" so a matching subagent is selected', (author) => {
		const twin = new LlmAgent({
			name: author,
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [twin],
		});
		const runner = makeRunner(root);
		const session = sessionWith([
			new Event({
				author,
				content: {
					role: "model",
					parts: [{ text: "from-cased-author" }],
				},
			}),
		]);

		expect((runner as any)._findAgentToRun(session, root)).toBe(twin);
	});

	it.each([
		"user ",
		"User ",
	] as const)("author %j stays in non-user history but misses findSubAgent → root fallback", (author) => {
		const child = new LlmAgent({
			name: "child_agent",
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		const runner = makeRunner(root);
		const session = sessionWith([
			new Event({
				author,
				content: {
					role: "user",
					parts: [{ text: "near-miss-user" }],
				},
			}),
		]);

		expect((runner as any)._findAgentToRun(session, root)).toBe(root);
	});

	it('exact lowercase "user" is filtered out of non-user history → root fallback', () => {
		const child = new LlmAgent({
			name: "child_agent",
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		const runner = makeRunner(root);
		const session = sessionWith([
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [{ text: "human" }],
				},
			}),
		]);

		expect((runner as any)._findAgentToRun(session, root)).toBe(root);
	});

	it("User ghost event before exact user still routes via reverse non-user scan", () => {
		const child = new LlmAgent({
			name: "child_agent",
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		const runner = makeRunner(root);
		const session = sessionWith([
			new Event({
				author: "child_agent",
				content: {
					role: "model",
					parts: [{ text: "prior" }],
				},
			}),
			new Event({
				author: "User",
				content: {
					role: "user",
					parts: [{ text: "looks-like-user-but-cased" }],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [{ text: "real-user" }],
				},
			}),
		]);

		// Reverse non-user: "User" (miss — no agent named User) then "child_agent" (hit)
		expect((runner as any)._findAgentToRun(session, root)).toBe(child);
	});
});
