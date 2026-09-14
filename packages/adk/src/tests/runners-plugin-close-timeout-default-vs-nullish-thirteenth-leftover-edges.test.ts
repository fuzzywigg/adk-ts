import { describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { PluginManager } from "../plugins/plugin-manager";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Thirteenth leftover: Runner default `pluginCloseTimeout = 5000` only for
 * undefined; PluginManager then uses `?? 5000`. 0 is kept; null becomes 5000.
 */
describe("runners pluginCloseTimeout default vs nullish thirteenth leftover", () => {
	const agent = new LlmAgent({
		name: "root_agent",
		model: "gemini-2.0-flash-exp",
	});
	const sessionService = new InMemorySessionService();

	it("omitted pluginCloseTimeout becomes 5000", () => {
		const runner = new Runner({
			appName: "app",
			agent,
			sessionService,
		});
		expect((runner.pluginManager as any).closeTimeout).toBe(5000);
	});

	it("explicit 0 is kept (Runner default param + PluginManager ??)", () => {
		const runner = new Runner({
			appName: "app",
			agent,
			sessionService,
			pluginCloseTimeout: 0,
		});
		expect((runner.pluginManager as any).closeTimeout).toBe(0);
	});

	it("null is not undefined so Runner keeps it, PluginManager ?? 5000", () => {
		const runner = new Runner({
			appName: "app",
			agent,
			sessionService,
			pluginCloseTimeout: null as any,
		});
		expect((runner.pluginManager as any).closeTimeout).toBe(5000);
	});

	it("empty string is kept via ?? (not 5000)", () => {
		const runner = new Runner({
			appName: "app",
			agent,
			sessionService,
			pluginCloseTimeout: "" as any,
		});
		expect((runner.pluginManager as any).closeTimeout).toBe("");
	});

	it("PluginManager still defaults omitted closeTimeout independently", () => {
		expect((new PluginManager() as any).closeTimeout).toBe(5000);
	});
});
