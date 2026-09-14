import { beforeEach, describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

/**
 * Twelfth leftover: `_findAgentToRun` uses `if (event?.author)` after FR match.
 * Falsy author skips findAgent and falls through to non-user reverse scan.
 */
describe("runners find-agent FR author falsy truthiness twelfth leftover edges", () => {
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
		"",
		null,
		undefined,
		0,
		false,
	])("FR-matched call author %j is falsy → skip findAgent, fall back to root", (author) => {
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
			appName: "runner-fr-author-falsy",
			agent: root,
			sessionService,
		});

		expect((runner as any)._findAgentToRun(frSession(author), root)).toBe(root);
	});

	it("truthy FR call author still routes via findAgent (control)", () => {
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
			appName: "runner-fr-author-falsy",
			agent: root,
			sessionService,
		});

		expect((runner as any)._findAgentToRun(frSession("tool_agent"), root)).toBe(
			child,
		);
	});
});
