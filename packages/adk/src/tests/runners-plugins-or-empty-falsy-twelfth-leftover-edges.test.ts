import { describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

class NamedPlugin extends BasePlugin {
	constructor(name: string) {
		super(name);
	}
}

/**
 * Twelfth leftover: Runner ctor `plugins || []` coalesces falsy plugin lists
 * so PluginManager never sees `null`/`0`/`""`/`false`.
 */
describe("runners plugins-or-empty falsy twelfth leftover edges", () => {
	const sessionService = new InMemorySessionService();
	const agent = new LlmAgent({
		name: "root_agent",
		model: "gemini-2.0-flash-exp",
	});

	it.each([
		{ label: "undefined", plugins: undefined },
		{ label: "null", plugins: null },
		{ label: "0", plugins: 0 },
		{ label: "empty-string", plugins: "" },
		{ label: "false", plugins: false },
	])("plugins $label coalesces to empty PluginManager list", ({ plugins }) => {
		const runner = new Runner({
			appName: "runner-plugins-or",
			agent,
			sessionService,
			plugins: plugins as any,
		});

		expect(runner.pluginManager.getPlugins()).toEqual([]);
	});

	it("empty array still registers nothing (control)", () => {
		const runner = new Runner({
			appName: "runner-plugins-or",
			agent,
			sessionService,
			plugins: [],
		});
		expect(runner.pluginManager.getPlugins()).toEqual([]);
	});

	it("truthy plugin list still registers (control)", () => {
		const plugin = new NamedPlugin("keep");
		const runner = new Runner({
			appName: "runner-plugins-or",
			agent,
			sessionService,
			plugins: [plugin],
		});
		expect(runner.pluginManager.getPlugins()).toEqual([plugin]);
	});
});
