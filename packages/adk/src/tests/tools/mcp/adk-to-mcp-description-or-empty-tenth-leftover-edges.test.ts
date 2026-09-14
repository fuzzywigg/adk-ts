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
 * Tenth leftover: adkToMcpToolType uses `description || ""` — undefined/null/0
 * become empty string; empty string stays; whitespace is kept.
 */
describe("adk-to-mcp description || empty tenth leftover edges", () => {
	it.each([
		{ label: "undefined", description: undefined },
		{ label: "null", description: null },
		{ label: "empty string", description: "" },
		{ label: "0", description: 0 },
		{ label: "false", description: false },
	])("falsy description ($label) becomes empty string", ({ description }) => {
		const mcp = adkToMcpToolType(makeTool({ description: description as any }));
		expect(mcp.description).toBe("");
	});

	it("whitespace description is kept (truthy)", () => {
		expect(adkToMcpToolType(makeTool({ description: " " })).description).toBe(
			" ",
		);
	});

	it("non-empty description is kept (control)", () => {
		expect(
			adkToMcpToolType(makeTool({ description: "search things" })).description,
		).toBe("search things");
	});

	it("inputSchema is always an object even with no declaration parameters", () => {
		const mcp = adkToMcpToolType(makeTool());
		expect(mcp.inputSchema).toEqual({
			type: "object",
			properties: {},
		});
		expect(mcp.name).toBe("t");
	});
});
