import { beforeEach, describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

/**
 * Fifteenth residual deepen (HEAVY tip-relaunch residual after tip 1f70668 (post #282/#284); supersedes closed #281/#285/#273/#262
 * author → skip findAgent. String `"0"` / `"false"` are truthy so
 * `if (event?.author)` routes via findAgent (missing name → undefined).
 */
describe("runners find-agent FR author string-zero/false fifteenth residual deepen", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
	});

	function frSession(callAuthor: unknown): Session {
		const call = new Event({
			author: "placeholder",
			content: {
				role: "model",
				parts: [{ functionCall: { id: "c1", name: "tool" } }],
			},
		});
		(call as { author: unknown }).author = callAuthor;
		const response = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "c1",
							name: "tool",
							response: { ok: true },
						},
					},
				],
			},
		});
		return {
			id: "s1",
			userId: "u1",
			events: [
				new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "hi" }] },
				}),
				call,
				response,
			],
		} as Session;
	}

	it.each([
		{ label: '"0"', author: "0" },
		{ label: '"false"', author: "false" },
	])("FR call author $label is truthy → findAgent (missing → undefined)", ({
		author,
	}) => {
		const child = new LlmAgent({
			name: "tool_agent",
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		const runner = new Runner({
			appName: "runner-fr-author-str15",
			agent: root,
			sessionService,
		});

		expect(
			(runner as any)._findAgentToRun(frSession(author), root),
		).toBeUndefined();
	});

	it("numeric 0 still falls back to root (twelfth control)", () => {
		const child = new LlmAgent({
			name: "tool_agent",
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		const runner = new Runner({
			appName: "runner-fr-author-str15",
			agent: root,
			sessionService,
		});

		expect((runner as any)._findAgentToRun(frSession(0), root)).toBe(root);
	});
});
