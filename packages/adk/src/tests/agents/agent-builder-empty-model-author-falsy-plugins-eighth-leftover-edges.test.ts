import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { LlmAgent } from "../../agents/llm-agent.js";
import { RunConfig, StreamingMode } from "../../agents/run-config.js";
import { Event } from "../../events/event.js";
import { BasePlugin } from "../../plugins/base-plugin.js";
import { Runner } from "../../runners.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";

class StubPlugin extends BasePlugin {
	constructor(name = "stub") {
		super(name);
	}
}

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
 * Eighth leftover: `!config.model` treats "" as missing but keeps whitespace;
 * ask `author || ""` then `author &&` skips 0/false; `plugins || []` and
 * `runConfig || {}` recover after forced falsy priors (tools-null is seventh).
 */
describe("AgentBuilder empty-model / author-falsy / plugins-runConfig eighth leftover", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it('withModel("") fails build via !config.model', async () => {
		const builder = AgentBuilder.create("empty_model").withModel("");
		await expect(builder.build()).rejects.toThrow(
			/Model is required for LLM agent/,
		);
	});

	it('forced model "" also fails (!config.model)', async () => {
		const builder =
			AgentBuilder.create("forced_empty").withModel("gemini-2.5-flash");
		(builder as any).config.model = "";
		await expect(builder.build()).rejects.toThrow(
			/Model is required for LLM agent/,
		);
	});

	it('withModel(" ") builds (whitespace is truthy)', async () => {
		const { agent } = await AgentBuilder.create("ws_model")
			.withModel(" ")
			.build();
		expect(agent).toBeInstanceOf(LlmAgent);
		expect((agent as LlmAgent).model).toBe(" ");
	});

	it.each([
		{ label: "0", author: 0 },
		{ label: "false", author: false },
	])("author $label coalesces to empty and is skipped from buffers", async ({
		author,
	}) => {
		const alpha = child("alpha");
		mockRunnerEvents([
			new Event({
				author: author as any,
				content: { parts: [{ text: "ghost-falsy" }] },
			}),
			new Event({
				author: "alpha",
				content: { parts: [{ text: "kept" }] },
			}),
		]);
		const { runner } = await AgentBuilder.create("ask_author_falsy")
			.asSequential([alpha])
			.withSessionService(sessionService, { userId: "u", appName: "a" })
			.build();
		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: "alpha", response: "kept" },
		]);
	});

	it("withPlugins recovers after forced-null plugins via plugins || []", () => {
		const plugin = new StubPlugin("after_null");
		const builder =
			AgentBuilder.create("plugins_null").withModel("gemini-2.5-flash");
		(builder as any).config.plugins = null;
		builder.withPlugins(plugin);
		expect((builder as any).config.plugins).toEqual([plugin]);
	});

	it.each([
		{ label: "null", prior: null },
		{ label: "0", prior: 0 },
		{ label: "false", prior: false },
	])("withRunConfig Partial after forced $label prior uses || {}", ({
		prior,
	}) => {
		const builder =
			AgentBuilder.create("rc_falsy").withModel("gemini-2.5-flash");
		(builder as any).runConfig = prior;
		builder.withRunConfig({ streamingMode: StreamingMode.SSE });
		const rc = (builder as any).runConfig as RunConfig;
		expect(rc).toBeInstanceOf(RunConfig);
		expect(rc.streamingMode).toBe(StreamingMode.SSE);
	});
});
