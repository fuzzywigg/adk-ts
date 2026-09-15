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
 * HEAVY tip-relaunch residual deepen after tip 1f70668 / post #286 (lands closed #278 onto tip; complements #259 true/negzero):
 * `description || ""` — POSITIVE_INFINITY / `1` / `{}` / `Object(true)` kept;
 * `NaN` collapses to `""`.
 */
describe("adk-to-mcp description posinf/nan/object-true twentieth residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("description $label kept via ||", ({ value }) => {
		expect(
			adkToMcpToolType(makeTool({ description: value as any })).description,
		).toBe(value);
	});

	it("description NaN collapses to empty string via ||", () => {
		expect(
			adkToMcpToolType(makeTool({ description: Number.NaN as any }))
				.description,
		).toBe("");
	});
});
