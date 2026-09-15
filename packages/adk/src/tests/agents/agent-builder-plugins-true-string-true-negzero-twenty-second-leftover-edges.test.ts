import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { BasePlugin } from "../../plugins/base-plugin.js";

class StubPlugin extends BasePlugin {
	constructor(name = "stub") {
		super(name);
	}
}

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * eighth pins `plugins || []` recover after forced-null. Assert boolean
 * `true` / `"true"` / ±Infinity forced priors diverge under spread;
 * SameValueZero `-0` coalesces to `[]` and recovers — residual true
 * asymmetry after twenty-first name/session tip.
 */
describe("AgentBuilder plugins true/string-true/negzero twenty-second leftover", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("forced plugins boolean true throws on spread (not iterable)", () => {
		const plugin = new StubPlugin("after_true");
		const builder =
			AgentBuilder.create("plugins_true").withModel("gemini-2.5-flash");
		(builder as any).config.plugins = true;
		expect(() => builder.withPlugins(plugin)).toThrow();
	});

	it('forced plugins "true" spreads string chars then appends plugin', () => {
		const plugin = new StubPlugin("after_str_true");
		const builder =
			AgentBuilder.create("plugins_str_true").withModel("gemini-2.5-flash");
		(builder as any).config.plugins = "true";
		builder.withPlugins(plugin);
		const plugins = (builder as any).config.plugins as unknown[];
		expect(plugins.slice(0, 4)).toEqual(["t", "r", "u", "e"]);
		expect(plugins.at(-1)).toBe(plugin);
	});

	it("SameValueZero -0 plugins coalesces to [] and recovers", () => {
		const plugin = new StubPlugin("after_neg0");
		const builder =
			AgentBuilder.create("plugins_neg0").withModel("gemini-2.5-flash");
		(builder as any).config.plugins = -0;
		builder.withPlugins(plugin);
		expect((builder as any).config.plugins).toEqual([plugin]);
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("forced plugins $label throws on spread (not iterable)", ({ value }) => {
		const plugin = new StubPlugin("after_inf");
		const builder =
			AgentBuilder.create("plugins_inf").withModel("gemini-2.5-flash");
		(builder as any).config.plugins = value;
		expect(() => builder.withPlugins(plugin)).toThrow();
	});

	it("empty-array plugins prior is truthy and appends via spread", () => {
		const plugin = new StubPlugin("after_arr");
		const builder =
			AgentBuilder.create("plugins_arr").withModel("gemini-2.5-flash");
		(builder as any).config.plugins = [];
		builder.withPlugins(plugin);
		expect((builder as any).config.plugins).toEqual([plugin]);
	});

	it('string "false" spreads chars (eighth control asymmetry)', () => {
		const plugin = new StubPlugin("after_false");
		const builder =
			AgentBuilder.create("plugins_false").withModel("gemini-2.5-flash");
		(builder as any).config.plugins = "false";
		builder.withPlugins(plugin);
		const plugins = (builder as any).config.plugins as unknown[];
		expect(plugins.slice(0, 5)).toEqual(["f", "a", "l", "s", "e"]);
		expect(plugins.at(-1)).toBe(plugin);
	});
});
