import { describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover (HEAVY tip-relaunch residual after #243):
 * Runner ctor `plugins || []` residual after twelfth classic falsy —
 * `-0`/`NaN` coalesce; empty object is truthy and reaches PluginManager.
 */
describe("runners plugins negzero/nan/empty-object fourteenth leftover", () => {
	const sessionService = new InMemorySessionService();
	const agent = new LlmAgent({
		name: "root_agent",
		model: "gemini-2.0-flash-exp",
	});

	it.each([
		{ label: "-0", plugins: -0 },
		{ label: "NaN", plugins: Number.NaN },
	])("plugins $label coalesces to empty PluginManager list", ({ plugins }) => {
		const runner = new Runner({
			appName: "runner-plugins-14h",
			agent,
			sessionService,
			plugins: plugins as any,
		});
		expect(runner.pluginManager.getPlugins()).toEqual([]);
	});

	it("empty-object plugins is truthy so PluginManager construction throws", () => {
		expect(() => {
			new Runner({
				appName: "runner-plugins-14h",
				agent,
				sessionService,
				plugins: {} as any,
			});
		}).toThrow();
	});
});
