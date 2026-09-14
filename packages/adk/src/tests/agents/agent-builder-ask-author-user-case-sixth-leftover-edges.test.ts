import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { LlmAgent } from "../../agents/llm-agent.js";
import { Event } from "../../events/event.js";
import { Runner } from "../../runners.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";

function mockRunnerEvents(events: Event[]) {
	vi.spyOn(Runner.prototype, "runAsync").mockImplementation(async function* () {
		for (const event of events) {
			yield event;
		}
	});
	vi.spyOn(Runner.prototype, "rewind").mockResolvedValue(undefined as never);
}

function child(name: string) {
	return new LlmAgent({ name, model: "gemini-2.5-flash" });
}

/**
 * Sixth leftover: ask buffers when author && author !== "user" (case-sensitive).
 * Exact "user" skip is covered; "USER"/"User" still enter perAgentBuffers.
 */
describe("AgentBuilder ask author user-case sixth leftover", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it.each([
		"USER",
		"User",
		"uSer",
	])("author %j is buffered (not filtered as user) but orphans unless sub-agent matches", async (author) => {
		const alpha = child("alpha");
		mockRunnerEvents([
			new Event({
				author,
				content: { parts: [{ text: "ghost-cased" }] },
			}),
			new Event({
				author: "alpha",
				content: { parts: [{ text: "A" }] },
			}),
		]);

		const { runner } = await AgentBuilder.create("ask_user_case")
			.asParallel([alpha, child("beta")])
			.withSessionService(sessionService, {
				userId: "u",
				appName: "a",
			})
			.build();

		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: "alpha", response: "A" },
			{ agent: "beta", response: "" },
		]);
	});

	it("exact lowercase author user is skipped from perAgentBuffers", async () => {
		const alpha = child("alpha");
		mockRunnerEvents([
			new Event({
				author: "user",
				content: { parts: [{ text: "from-user" }] },
			}),
			new Event({
				author: "alpha",
				content: { parts: [{ text: "kept" }] },
			}),
		]);

		const { runner } = await AgentBuilder.create("ask_exact_user")
			.asSequential([alpha])
			.withSessionService(sessionService, {
				userId: "u",
				appName: "a",
			})
			.build();

		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: "alpha", response: "kept" },
		]);
	});

	it("cased USER matching a sub-agent name is returned in multi map", async () => {
		const cased = child("USER");
		mockRunnerEvents([
			new Event({
				author: "USER",
				content: { parts: [{ text: "from-USER" }] },
			}),
		]);

		const { runner } = await AgentBuilder.create("ask_match_USER")
			.asParallel([cased])
			.withSessionService(sessionService, {
				userId: "u",
				appName: "a",
			})
			.build();

		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: "USER", response: "from-USER" },
		]);
	});
});
