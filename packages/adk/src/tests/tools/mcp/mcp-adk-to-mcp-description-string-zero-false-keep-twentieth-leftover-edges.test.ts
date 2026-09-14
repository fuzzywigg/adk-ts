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
 * Twentieth leftover: adkToMcpToolType `description || ""` —
 * string "0"/"false" are truthy and kept (tenth only pinned falsy → "").
 */
describe("adk-to-mcp description string-zero/false keep twentieth leftover", () => {
	it.each([
		"0",
		"false",
	] as const)("description: %j kept via ||", (description) => {
		expect(
			adkToMcpToolType(makeTool({ description: description as any }))
				.description,
		).toBe(description);
	});

	it("falsy still → empty string (tenth control)", () => {
		expect(adkToMcpToolType(makeTool({ description: "" })).description).toBe(
			"",
		);
		expect(
			adkToMcpToolType(makeTool({ description: 0 as any })).description,
		).toBe("");
	});

	it("whitespace still kept (tenth control)", () => {
		expect(adkToMcpToolType(makeTool({ description: " " })).description).toBe(
			" ",
		);
	});
});
