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
 * Eighth leftover: ask uses `const author = event.author || ""` then
 * `if (author && author !== "user")`. Sixth leftover pinned USER case;
 * author 0/false/null still coalesce and skip buffering.
 */
describe("AgentBuilder ask author falsy || eighth leftover", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "0", author: 0 },
		{ label: "false", author: false },
		{ label: "null", author: null },
	])('author $label coalesces to "" and skips perAgentBuffers', async ({
		author,
	}) => {
		const alpha = child("alpha");
		mockRunnerEvents([
			new Event({
				author: author as any,
				content: { parts: [{ text: "ghost" }] },
			}),
			new Event({
				author: "alpha",
				content: { parts: [{ text: "A" }] },
			}),
		]);

		const { runner } = await AgentBuilder.create("ask_author_falsy")
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

	it('author string "0" is truthy and buffers under key "0"', async () => {
		const zero = child("temp_zero");
		(zero as { name: string }).name = "0";
		mockRunnerEvents([
			new Event({
				author: "0",
				content: { parts: [{ text: "from-zero" }] },
			}),
		]);

		const { runner } = await AgentBuilder.create("ask_author_zero_str")
			.asSequential([zero])
			.withSessionService(sessionService, {
				userId: "u",
				appName: "a",
			})
			.build();

		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: "0", response: "from-zero" },
		]);
	});
});
