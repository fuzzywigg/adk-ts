import { describe, expect, it } from "vitest";
import { declarationToJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twenty-first leftover (HEAVY tip-relaunch residual after thirteenth falsy
 * `parameters` → `{}`): `if (!declaration.parameters)` — boolean `true` /
 * `"true"` / `[]` truthy → return whole value (no `.properties`); SameValueZero
 * `-0` → `{}`.
 */
describe("mcp declaration parameters true/negzero twenty-first leftover", () => {
	it("parameters: boolean true truthy → returns whole true (no properties)", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: true,
			} as any),
		).toBe(true);
	});

	it('parameters: "true" truthy → returns whole string', () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: "true",
			} as any),
		).toBe("true");
	});

	it("parameters: [] truthy → returns whole empty array", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: [],
			} as any),
		).toEqual([]);
	});

	it("parameters: NEGATIVE_INFINITY truthy → returns whole -Infinity", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: Number.NEGATIVE_INFINITY,
			} as any),
		).toBe(Number.NEGATIVE_INFINITY);
	});

	it("parameters: -0 falsy → {}", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: -0,
			} as any),
		).toEqual({});
	});
});
