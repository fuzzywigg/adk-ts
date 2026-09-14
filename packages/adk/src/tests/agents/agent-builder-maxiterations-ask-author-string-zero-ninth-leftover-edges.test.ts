import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { LlmAgent } from "../../agents/llm-agent.js";
import { LoopAgent } from "../../agents/loop-agent.js";
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
 * Ninth leftover: builder `maxIterations || 3` keeps string `"0"` (LoopAgent
 * then zero-runs); ask `author || ""` then `author &&` admits `"0"`/`"false"`
 * into perAgentBuffers. Seventh/eighth cover numeric/boolean falsy only.
 */
describe("AgentBuilder maxIterations/ask-author string-zero ninth leftover", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it('forced maxIterations "0" is kept via || 3 (not coalesced)', async () => {
		const builder = AgentBuilder.create("loop_str_zero").asLoop([child("c")]);
		(builder as any).config.maxIterations = "0";
		const { agent } = await builder.build();
		expect((agent as LoopAgent).maxIterations).toBe("0");
	});

	it("forced maxIterations 0 still coalesces to 3 (seventh control)", async () => {
		const builder = AgentBuilder.create("loop_num_zero").asLoop([child("c")]);
		(builder as any).config.maxIterations = 0;
		const { agent } = await builder.build();
		expect((agent as LoopAgent).maxIterations).toBe(3);
	});

	it.each([
		{ label: '"0"', author: "0", agentName: "0" },
		{ label: '"false"', author: "false", agentName: "false" },
	])("author $label enters perAgentBuffers (truthy string)", async ({
		author,
		agentName,
	}) => {
		// BaseAgent.validateName rejects digit-leading names; mutate after ctor.
		const named = child("tmp_author");
		(named as { name: string }).name = agentName;
		mockRunnerEvents([
			new Event({
				author: author as any,
				content: { parts: [{ text: "kept-str" }] },
			}),
		]);
		const { runner } = await AgentBuilder.create("ask_author_str")
			.asSequential([named])
			.withSessionService(sessionService, { userId: "u", appName: "a" })
			.build();
		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: agentName, response: "kept-str" },
		]);
	});

	it("author numeric 0 still skipped from buffers (eighth control)", async () => {
		const alpha = child("alpha");
		mockRunnerEvents([
			new Event({
				author: 0 as any,
				content: { parts: [{ text: "ghost" }] },
			}),
			new Event({
				author: "alpha",
				content: { parts: [{ text: "kept" }] },
			}),
		]);
		const { runner } = await AgentBuilder.create("ask_author_num")
			.asSequential([alpha])
			.withSessionService(sessionService, { userId: "u", appName: "a" })
			.build();
		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: "alpha", response: "kept" },
		]);
	});
});
