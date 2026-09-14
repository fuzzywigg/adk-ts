import { describe, expect, it } from "vitest";
import { declarationToJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual complement after #259):
 * `if (!declaration.parameters)` — boolean `true` / `"true"` / `[]` /
 * `NEGATIVE_INFINITY` kept as whole parameters (no `.properties`);
 * SameValueZero `-0` falsy → `{}`. Thirteenth pinned null/0 + properties path.
 */
describe("mcp declaration parameters true/negzero twentieth leftover complement", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("parameters $label returned as whole bag (no properties)", ({ value }) => {
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: value as any,
			} as any),
		).toBe(value);
	});

	it("parameters -0 is falsy → {}", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: -0 as any,
			} as any),
		).toEqual({});
	});
});
