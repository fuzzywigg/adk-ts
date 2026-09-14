import { describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Twentieth leftover: twelfth leftover pins classic falsy `plugins || []`
 * coalescing to []. String `"0"` / `"false"` are truthy so Runner forwards
 * them; PluginManager then iterates string characters as plugins.
 */
describe("runners plugins string-zero/false truthy iterate twentieth leftover", () => {
	const sessionService = new InMemorySessionService();
	const agent = new LlmAgent({
		name: "root_agent",
		model: "gemini-2.0-flash-exp",
	});

	it('plugins "0" is truthy — PluginManager registers the single char', () => {
		const runner = new Runner({
			appName: "runner-plugins-str",
			agent,
			sessionService,
			plugins: "0" as any,
		});
		expect(runner.pluginManager.getPlugins()).toHaveLength(1);
		expect(runner.pluginManager.getPlugins()[0]).toBe("0");
	});

	it('plugins "false" iterates chars — duplicate undefined name throws', () => {
		expect(() => {
			new Runner({
				appName: "runner-plugins-str",
				agent,
				sessionService,
				plugins: "false" as any,
			});
		}).toThrow(/already registered/i);
	});

	it("numeric 0 still coalesces to empty (twelfth control)", () => {
		const runner = new Runner({
			appName: "runner-plugins-str",
			agent,
			sessionService,
			plugins: 0 as any,
		});
		expect(runner.pluginManager.getPlugins()).toEqual([]);
	});
});
