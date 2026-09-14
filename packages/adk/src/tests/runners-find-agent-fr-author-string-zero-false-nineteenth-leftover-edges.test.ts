import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

/**
 * Nineteenth leftover (runners residual): FR-matched call author `"0"`/`"false"`
 * are truthy → findAgent is called with that string (twelfth only falsy skip).
 */
describe("runners find-agent FR author string-zero/false nineteenth leftover", () => {
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
		{ label: "string-zero", author: "0" },
		{ label: "string-false", author: "false" },
	])("truthy FR author $label calls findAgent with that string", ({
		author,
	}) => {
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		const findSpy = vi.spyOn(root, "findAgent").mockReturnValue(root);
		const runner = new Runner({
			appName: "runner-fr-author-truthy",
			agent: root,
			sessionService,
		});

		expect((runner as any)._findAgentToRun(frSession(author), root)).toBe(root);
		expect(findSpy).toHaveBeenCalledWith(author);
	});
});
