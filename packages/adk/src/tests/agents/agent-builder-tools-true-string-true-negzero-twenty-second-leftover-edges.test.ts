import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { createTool } from "../../tools/base/create-tool.js";

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * seventh pins `tools || []` recover after forced-null; plugins twenty-second
 * covers plugins spread. Assert boolean `true` / `"true"` / ±Infinity forced
 * priors diverge under withTools spread; SameValueZero `-0` coalesces to `[]`.
 */
describe("AgentBuilder tools true/string-true/negzero twenty-second leftover", () => {
	const tool = createTool({
		name: "echo",
		description: "echo",
		execute: async () => ({ ok: true }),
	});

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("forced tools boolean true throws on spread (not iterable)", () => {
		const builder =
			AgentBuilder.create("tools_true").withModel("gemini-2.5-flash");
		(builder as any).config.tools = true;
		expect(() => builder.withTools(tool)).toThrow();
	});

	it('forced tools "true" spreads string chars then appends tool', () => {
		const builder =
			AgentBuilder.create("tools_str_true").withModel("gemini-2.5-flash");
		(builder as any).config.tools = "true";
		builder.withTools(tool);
		const tools = (builder as any).config.tools as unknown[];
		expect(tools.slice(0, 4)).toEqual(["t", "r", "u", "e"]);
		expect(tools.at(-1)).toBe(tool);
	});

	it("SameValueZero -0 tools coalesces to [] and recovers", () => {
		const builder =
			AgentBuilder.create("tools_neg0").withModel("gemini-2.5-flash");
		(builder as any).config.tools = -0;
		builder.withTools(tool);
		expect((builder as any).config.tools).toEqual([tool]);
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("forced tools $label throws on spread (not iterable)", ({ value }) => {
		const builder =
			AgentBuilder.create("tools_inf").withModel("gemini-2.5-flash");
		(builder as any).config.tools = value;
		expect(() => builder.withTools(tool)).toThrow();
	});

	it("empty-array tools prior is truthy and appends via spread", () => {
		const builder =
			AgentBuilder.create("tools_arr").withModel("gemini-2.5-flash");
		(builder as any).config.tools = [];
		builder.withTools(tool);
		expect((builder as any).config.tools).toEqual([tool]);
	});
});
