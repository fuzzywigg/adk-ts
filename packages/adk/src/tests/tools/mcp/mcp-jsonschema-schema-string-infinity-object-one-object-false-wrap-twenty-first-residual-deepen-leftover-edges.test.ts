import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { jsonSchemaToDeclaration } from "../../../tools/mcp/schema-conversion";

/**
 * Twenty-first leftover residual deepen (complements #286 nan/posinf):
 * `if (schema)` wrap — string `"Infinity"` / `Object(1)` / `Object(false)`
 * wrap as properties bag (boxed false is truthy).
 */
describe("mcp jsonschema schema string-infinity/object-one/object-false wrap twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("wraps schema $label as properties bag", ({ value }) => {
		expect(jsonSchemaToDeclaration("n", "d", value as any).parameters).toEqual({
			type: Type.OBJECT,
			properties: value,
		});
	});
});
