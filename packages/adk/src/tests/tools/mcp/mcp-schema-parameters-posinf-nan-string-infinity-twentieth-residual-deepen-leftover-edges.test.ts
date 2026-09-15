import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { mcpSchemaToParameters } from "../../../tools/mcp/schema-conversion";

/**
 * HEAVY tip-relaunch residual deepen after tip 1f70668 / post #286 (lands closed
 * #278 onto tip; complements #259 parameters true/negzero): `"parameters" in …
 * && mcpTool.parameters` — POSITIVE_INFINITY / `1` / `Object(true)` / `{}` truthy
 * → normalize object path; string `"Infinity"` spreads to char-index properties;
 * `NaN` falsy → empty OBJECT fallback.
 */
describe("mcp schema parameters posinf/nan/string-infinity twentieth residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "Object(true)", value: Object(true) },
		{ label: "empty object", value: {} },
	])("parameters: $label truthy → normalize yields typed OBJECT", ({
		value,
	}) => {
		expect(
			mcpSchemaToParameters({
				name: "p_residual",
				parameters: value,
			} as any),
		).toEqual({
			type: Type.OBJECT,
		});
	});

	it('parameters: "Infinity" truthy string spreads to char-index properties', () => {
		expect(
			mcpSchemaToParameters({
				name: "p_inf_str",
				parameters: "Infinity",
			} as any),
		).toEqual({
			type: Type.OBJECT,
			0: "I",
			1: "n",
			2: "f",
			3: "i",
			4: "n",
			5: "i",
			6: "t",
			7: "y",
		});
	});

	it("parameters: NaN falsy → empty OBJECT properties fallback", () => {
		expect(
			mcpSchemaToParameters({
				name: "p_nan",
				parameters: Number.NaN,
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});
});
