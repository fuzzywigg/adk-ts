import { describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Nineteenth leftover (runners residual): pluginCloseTimeout NaN/false/"0"/-0
 * survive Runner default-param + PluginManager `??` (thirteenth: omit/0/null/"").
 */
describe("runners pluginCloseTimeout nan/false/string-zero nineteenth leftover", () => {
	const agent = new LlmAgent({
		name: "root_agent",
		model: "gemini-2.0-flash-exp",
	});
	const sessionService = new InMemorySessionService();

	it("NaN is kept via ?? (not 5000)", () => {
		const runner = new Runner({
			appName: "app",
			agent,
			sessionService,
			pluginCloseTimeout: Number.NaN as any,
		});
		expect(Number.isNaN((runner.pluginManager as any).closeTimeout)).toBe(true);
	});

	it("false is kept via ??", () => {
		const runner = new Runner({
			appName: "app",
			agent,
			sessionService,
			pluginCloseTimeout: false as any,
		});
		expect((runner.pluginManager as any).closeTimeout).toBe(false);
	});

	it('string "0" is kept via ??', () => {
		const runner = new Runner({
			appName: "app",
			agent,
			sessionService,
			pluginCloseTimeout: "0" as any,
		});
		expect((runner.pluginManager as any).closeTimeout).toBe("0");
	});

	it("-0 is kept (distinct from omit default)", () => {
		const runner = new Runner({
			appName: "app",
			agent,
			sessionService,
			pluginCloseTimeout: -0 as any,
		});
		expect(Object.is((runner.pluginManager as any).closeTimeout, -0)).toBe(
			true,
		);
	});
});
