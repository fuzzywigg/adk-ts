import { describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover residual deepen (complements #254 -0/NaN/{}):
 * Runner ctor `plugins || []` — string `"Infinity"` / `Object(1)` /
 * `Object(false)` are truthy so PluginManager construction throws (like `{}`).
 */
describe("runners plugins string-infinity/object-one/object-false fourteenth residual deepen", () => {
	const sessionService = new InMemorySessionService();
	const agent = new LlmAgent({
		name: "root_agent",
		model: "gemini-2.0-flash-exp",
	});

	it.each([
		{ label: 'string "Infinity"', plugins: "Infinity" },
		{ label: "Object(1)", plugins: Object(1) },
		{ label: "Object(false)", plugins: Object(false) },
	])("plugins $label is truthy so PluginManager construction throws", ({
		plugins,
	}) => {
		expect(() => {
			new Runner({
				appName: "runner-plugins-14rd",
				agent,
				sessionService,
				plugins: plugins as any,
			});
		}).toThrow();
	});
});
