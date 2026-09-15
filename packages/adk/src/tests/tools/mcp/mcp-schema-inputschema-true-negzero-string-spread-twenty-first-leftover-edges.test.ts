import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { mcpSchemaToParameters } from "../../../tools/mcp/schema-conversion";

/**
 * Twenty-first leftover (HEAVY tip-relaunch residual after twentieth parameters):
 * `if (mcpTool.inputSchema)` — boolean `true` / `NEGATIVE_INFINITY` / `[]`
 * truthy → normalize OBJECT; string `"true"` spreads to char-index props;
 * SameValueZero `-0` falsy → empty OBJECT fallback. Twentieth pinned
 * `parameters` only; tenth pinned classic falsy inputSchema.
 */
describe("mcp schema inputSchema true/negzero/string-spread twenty-first leftover", () => {
	it("inputSchema: boolean true truthy → normalize yields typed OBJECT (no props)", () => {
		expect(
			mcpSchemaToParameters({
				name: "is_bool",
				inputSchema: true,
			} as any),
		).toEqual({
			type: Type.OBJECT,
		});
	});

	it('inputSchema: "true" truthy string spreads to char-index properties', () => {
		expect(
			mcpSchemaToParameters({
				name: "is_str",
				inputSchema: "true",
			} as any),
		).toEqual({
			type: Type.OBJECT,
			0: "t",
			1: "r",
			2: "u",
			3: "e",
		});
	});

	it("inputSchema: [] is truthy object → normalize yields typed OBJECT", () => {
		expect(
			mcpSchemaToParameters({
				name: "is_arr",
				inputSchema: [],
			} as any),
		).toEqual({
			type: Type.OBJECT,
		});
	});

	it("inputSchema: NEGATIVE_INFINITY truthy → normalize yields typed OBJECT", () => {
		expect(
			mcpSchemaToParameters({
				name: "is_ninf",
				inputSchema: Number.NEGATIVE_INFINITY,
			} as any),
		).toEqual({
			type: Type.OBJECT,
		});
	});

	it("inputSchema: -0 falsy → empty OBJECT properties fallback", () => {
		expect(
			mcpSchemaToParameters({
				name: "is_neg0",
				inputSchema: -0,
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});
});
