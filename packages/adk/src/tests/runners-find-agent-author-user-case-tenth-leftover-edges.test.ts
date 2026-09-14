import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

/**
 * Tenth leftover: e.author !== "user" is case-sensitive. "User"/"USER" stay in
 * nonUserEvents and can route to a matching sub-agent or fall through as ghosts.
 */
describe("runners find-agent author user-case tenth leftover edges", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
	});

	it.each([
		"USER",
		"User",
		"uSer",
	])("author %j is not filtered as user and routes to matching sub-agent", (author) => {
		const child = new LlmAgent({
			name: author,
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		const runner = new Runner({
			appName: "runner-author-case",
			agent: root,
			sessionService,
		});

		const session = {
			id: "s1",
			userId: "u1",
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "hi" }] },
				}),
				new Event({
					author,
					content: { role: "model", parts: [{ text: "from-cased" }] },
				}),
			],
		} as Session;

		expect((runner as any)._findAgentToRun(session, root)).toBe(child);
	});

	it("exact lowercase author user is filtered out → falls back to root", () => {
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new Runner({
			appName: "runner-author-case",
			agent: root,
			sessionService,
		});
		const debug = vi
			.spyOn((runner as any).logger, "debug")
			.mockImplementation(() => {});

		const session = {
			id: "s2",
			userId: "u1",
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "only user" }] },
				}),
			],
		} as Session;

		expect((runner as any)._findAgentToRun(session, root)).toBe(root);
		expect(debug).not.toHaveBeenCalled();
	});

	it("cased USER ghost author (no sub-agent) falls back to root with debug", () => {
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new Runner({
			appName: "runner-author-case",
			agent: root,
			sessionService,
		});
		const debug = vi
			.spyOn((runner as any).logger, "debug")
			.mockImplementation(() => {});

		const session = {
			id: "s3",
			userId: "u1",
			events: [
				new Event({
					author: "USER",
					content: { role: "model", parts: [{ text: "ghost" }] },
				}),
			],
		} as Session;

		expect((runner as any)._findAgentToRun(session, root)).toBe(root);
		expect(debug).toHaveBeenCalled();
	});
});
