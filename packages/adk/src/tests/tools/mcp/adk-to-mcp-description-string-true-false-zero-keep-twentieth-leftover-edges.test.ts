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
 * Twentieth leftover: adkToMcpToolType `description || ""` — string
 * `"true"`/`"false"`/`"0"` kept (tenth pinned falsy → `""`).
 */
describe("adk-to-mcp description string-true/false/zero keep twentieth leftover", () => {
	it.each([
		"true",
		"false",
		"0",
	] as const)("description %j kept via ||", (description) => {
		expect(adkToMcpToolType(makeTool({ description })).description).toBe(
			description,
		);
	});

	it("boolean true description kept (truthy || skip)", () => {
		expect(
			adkToMcpToolType(makeTool({ description: true as any })).description,
		).toBe(true);
	});

	it("falsy description still becomes empty string (tenth control)", () => {
		expect(
			adkToMcpToolType(makeTool({ description: false as any })).description,
		).toBe("");
	});
});
