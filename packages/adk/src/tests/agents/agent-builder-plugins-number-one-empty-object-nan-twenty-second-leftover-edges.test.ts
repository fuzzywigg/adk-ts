import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { BasePlugin } from "../../plugins/base-plugin.js";

class StubPlugin extends BasePlugin {
	constructor(name = "stub") {
		super(name);
	}
}

/**
 * Twenty-second leftover (HEAVY residual complement after open #265 plugins
 * tip): Assert number `1` / `{}` throw on spread; `NaN` coalesces to `[]`
 * and recovers.
 */
describe("AgentBuilder plugins number-one/empty-object/NaN twenty-second leftover", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("forced plugins number 1 throws on spread (not iterable)", () => {
		const plugin = new StubPlugin("after_one");
		const builder =
			AgentBuilder.create("plugins_one").withModel("gemini-2.5-flash");
		(builder as any).config.plugins = 1;
		expect(() => builder.withPlugins(plugin)).toThrow();
	});

	it("forced plugins empty-object throws on spread (not iterable)", () => {
		const plugin = new StubPlugin("after_obj");
		const builder =
			AgentBuilder.create("plugins_obj").withModel("gemini-2.5-flash");
		(builder as any).config.plugins = {};
		expect(() => builder.withPlugins(plugin)).toThrow();
	});

	it("NaN plugins coalesces to [] and recovers", () => {
		const plugin = new StubPlugin("after_nan");
		const builder =
			AgentBuilder.create("plugins_nan").withModel("gemini-2.5-flash");
		(builder as any).config.plugins = Number.NaN;
		builder.withPlugins(plugin);
		expect((builder as any).config.plugins).toEqual([plugin]);
	});
});
