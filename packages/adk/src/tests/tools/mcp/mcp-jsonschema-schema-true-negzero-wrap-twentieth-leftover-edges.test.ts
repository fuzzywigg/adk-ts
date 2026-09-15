import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { jsonSchemaToDeclaration } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual complement after providers tip #269 / #259):
 * `if (schema)` wrap — boolean `true` / `"true"` / `NEGATIVE_INFINITY` wrap as
 * properties bag; SameValueZero `-0` falsy → empty-object default.
 * Eleventh pinned classic falsy + `[]` / `1` wrap.
 */
describe("mcp jsonschema schema true/negzero wrap twentieth leftover complement", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("wraps schema $label as properties bag", ({ value }) => {
		expect(jsonSchemaToDeclaration("n", "d", value as any).parameters).toEqual({
			type: Type.OBJECT,
			properties: value,
		});
	});

	it("schema -0 is falsy → empty object parameters", () => {
		expect(jsonSchemaToDeclaration("n", "d", -0 as any).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});
});
