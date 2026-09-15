import { describe, expect, it } from "vitest";
import { declarationToJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twenty-first leftover residual deepen (complements #286 nan/posinf):
 * `if (!declaration.parameters)` then `.properties` — string `"Infinity"` /
 * `Object(1)` / `Object(false)` keep by identity (truthy, no `.properties`).
 */
describe("mcp declaration parameters string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("parameters $label returned as whole bag (no properties)", ({ value }) => {
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: value as any,
			} as any),
		).toBe(value);
	});
});
