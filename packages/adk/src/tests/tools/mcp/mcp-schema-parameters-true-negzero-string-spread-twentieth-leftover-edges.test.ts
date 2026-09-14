import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { mcpSchemaToParameters } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after fourteenth empty-array
 * parameters): `"parameters" in … && mcpTool.parameters` — boolean `true` /
 * `NEGATIVE_INFINITY` truthy → normalize object path; string `"true"` spreads
 * to char-index properties; SameValueZero `-0` falsy → empty OBJECT fallback.
 */
describe("mcp schema parameters true/negzero/string-spread twentieth leftover", () => {
	it("parameters: boolean true truthy → normalize yields typed OBJECT (no props)", () => {
		expect(
			mcpSchemaToParameters({
				name: "p_bool",
				parameters: true,
			} as any),
		).toEqual({
			type: Type.OBJECT,
		});
	});

	it('parameters: "true" truthy string spreads to char-index properties', () => {
		expect(
			mcpSchemaToParameters({
				name: "p_str",
				parameters: "true",
			} as any),
		).toEqual({
			type: Type.OBJECT,
			0: "t",
			1: "r",
			2: "u",
			3: "e",
		});
	});

	it("parameters: NEGATIVE_INFINITY truthy → normalize yields typed OBJECT", () => {
		expect(
			mcpSchemaToParameters({
				name: "p_ninf",
				parameters: Number.NEGATIVE_INFINITY,
			} as any),
		).toEqual({
			type: Type.OBJECT,
		});
	});

	it("parameters: -0 falsy → empty OBJECT properties fallback", () => {
		expect(
			mcpSchemaToParameters({
				name: "p_neg0",
				parameters: -0,
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});
});
