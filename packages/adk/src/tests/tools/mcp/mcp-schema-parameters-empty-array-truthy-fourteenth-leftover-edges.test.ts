import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { mcpSchemaToParameters } from "../../../tools/mcp/schema-conversion";

/**
 * Fourteenth leftover: `"parameters" in … && mcpTool.parameters` — empty array
 * [] is truthy so it enters normalize (unlike falsy parameters fallthrough).
 */
describe("mcp-schema parameters empty-array truthy fourteenth leftover", () => {
	it("parameters: [] without inputSchema normalizes to typed OBJECT (no properties)", () => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				parameters: [],
			} as any),
		).toEqual({ type: Type.OBJECT });
	});

	it.each([
		null,
		undefined,
		false,
		0,
		"",
	] as const)("falsy parameters %j without inputSchema yields empty OBJECT properties", (parameters) => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				parameters: parameters as any,
			} as any),
		).toEqual({ type: Type.OBJECT, properties: {} });
	});
});
