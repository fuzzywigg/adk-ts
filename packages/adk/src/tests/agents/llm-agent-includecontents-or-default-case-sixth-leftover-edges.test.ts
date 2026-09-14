import { describe, expect, it } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";

/**
 * Sixth leftover: `this.includeContents = config.includeContents || "default"`
 * only coalesces falsy values. Wrong-case `"Default"`/`"NONE"` stay as-is
 * (unlike contents processor which then treats them as current-turn).
 */
describe("LlmAgent includeContents || default case sixth leftover edges", () => {
	it.each([
		"Default",
		"DEFAULT",
		"None",
		"NONE",
		"current",
	] as const)("keeps truthy non-canonical includeContents %j", (includeContents) => {
		const agent = new LlmAgent({
			name: "inc_case",
			includeContents: includeContents as any,
		});
		expect(agent.includeContents).toBe(includeContents);
	});

	it.each([
		{ label: "omitted", value: undefined, expected: "default" },
		{ label: '""', value: "", expected: "default" },
		{ label: "null", value: null, expected: "default" },
	] as const)("coalesces falsy $label to default via ||", ({
		value,
		expected,
	}) => {
		const agent = new LlmAgent({
			name: "inc_falsy",
			includeContents: value as any,
		});
		expect(agent.includeContents).toBe(expected);
	});

	it("preserves exact none (control)", () => {
		expect(
			new LlmAgent({ name: "inc_none", includeContents: "none" })
				.includeContents,
		).toBe("none");
	});
});
