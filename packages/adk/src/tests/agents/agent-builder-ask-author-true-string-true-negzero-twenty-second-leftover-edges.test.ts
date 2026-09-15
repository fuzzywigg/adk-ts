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
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * eighth pins ask `author || ""` then `author &&` for `0`/`false`. Assert
 * boolean `true` / `"true"` / ±Infinity buffer under coerced keys; SameValueZero
 * `-0` coalesces to `""` and is skipped — residual true asymmetry after
 * twenty-first name/session tip.
 */
describe("AgentBuilder ask author true/string-true/negzero twenty-second leftover", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "boolean true", author: true, agentName: "true" },
		{ label: '"true"', author: "true", agentName: "true" },
		{
			label: "POSITIVE_INFINITY",
			author: Number.POSITIVE_INFINITY,
			agentName: "Infinity",
		},
	])("author $label is buffered and matches sub-agent $agentName", async ({
		author,
		agentName,
	}) => {
		const matched = child(agentName);
		mockRunnerEvents([
			new Event({
				author: author as any,
				content: { parts: [{ text: "from-true" }] },
			}),
		]);
		const { runner } = await AgentBuilder.create("ask_true_author")
			.asSequential([matched])
			.withSessionService(sessionService, { userId: "u", appName: "a" })
			.build();
		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: agentName, response: "from-true" },
		]);
	});

	it("NEGATIVE_INFINITY author buffers under '-Infinity' key (orphan vs alpha)", async () => {
		const alpha = child("alpha");
		mockRunnerEvents([
			new Event({
				author: Number.NEGATIVE_INFINITY as any,
				content: { parts: [{ text: "ghost-neginf" }] },
			}),
			new Event({
				author: "alpha",
				content: { parts: [{ text: "kept" }] },
			}),
		]);
		const { runner } = await AgentBuilder.create("ask_neginf_author")
			.asSequential([alpha])
			.withSessionService(sessionService, { userId: "u", appName: "a" })
			.build();
		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: "alpha", response: "kept" },
		]);
	});

	it("SameValueZero -0 author coalesces to empty and is skipped", async () => {
		const alpha = child("alpha");
		mockRunnerEvents([
			new Event({
				author: -0 as any,
				content: { parts: [{ text: "ghost-neg0" }] },
			}),
			new Event({
				author: "alpha",
				content: { parts: [{ text: "kept" }] },
			}),
		]);
		const { runner } = await AgentBuilder.create("ask_neg0_author")
			.asSequential([alpha])
			.withSessionService(sessionService, { userId: "u", appName: "a" })
			.build();
		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: "alpha", response: "kept" },
		]);
	});

	it("empty-array author is truthy but ToString key is empty (orphan)", async () => {
		const alpha = child("alpha");
		mockRunnerEvents([
			new Event({
				author: [] as any,
				content: { parts: [{ text: "ghost-arr" }] },
			}),
			new Event({
				author: "alpha",
				content: { parts: [{ text: "kept" }] },
			}),
		]);
		const { runner } = await AgentBuilder.create("ask_arr_author")
			.asSequential([alpha])
			.withSessionService(sessionService, { userId: "u", appName: "a" })
			.build();
		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: "alpha", response: "kept" },
		]);
	});

	it('string "false" author still buffers (eighth control asymmetry)', async () => {
		const matched = child("false");
		mockRunnerEvents([
			new Event({
				author: "false",
				content: { parts: [{ text: "from-false" }] },
			}),
		]);
		const { runner } = await AgentBuilder.create("ask_false_author")
			.asSequential([matched])
			.withSessionService(sessionService, { userId: "u", appName: "a" })
			.build();
		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: "false", response: "from-false" },
		]);
	});
});
