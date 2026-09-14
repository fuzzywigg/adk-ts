import { describe, expect, it } from "vitest";
import type { BaseTool } from "../../../tools/base/base-tool";
import { adkToMcpToolType } from "../../../tools/mcp/schema-conversion";

function makeTool(overrides: Partial<BaseTool> = {}): BaseTool {
	return {
		name: "t",
		description: "d",
		getDeclaration: () => ({ name: "t", description: "d" }),
		...overrides,
	} as BaseTool;
}

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after tenth || empty):
 * `description || ""` keeps boolean `true` / `"true"` / `[]` /
 * `NEGATIVE_INFINITY`; SameValueZero `-0` collapses to `""`. Tenth pinned
 * classic falsy only.
 */
describe("adk-to-mcp description true/negzero twentieth leftover", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("description $label kept via ||", ({ value }) => {
		expect(
			adkToMcpToolType(makeTool({ description: value as any })).description,
		).toBe(value);
	});

	it("description -0 collapses to empty string via ||", () => {
		expect(
			adkToMcpToolType(makeTool({ description: -0 as any })).description,
		).toBe("");
	});
});
