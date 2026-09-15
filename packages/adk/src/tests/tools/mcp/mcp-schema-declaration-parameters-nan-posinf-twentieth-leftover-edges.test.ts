import { describe, expect, it } from "vitest";
import { declarationToJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after providers tip #269):
 * `if (!declaration.parameters)` then `.properties` — complements closed #271
 * true/`"true"`/`[]`/`-Infinity` keep / `-0`→`{}` with `POSITIVE_INFINITY` /
 * `1` keep; `NaN`→`{}`; `Object(true)`/`{}` identity keep (no `.properties`).
 */
describe("mcp declaration parameters nan/posinf twentieth leftover heavy", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
	])("parameters $label returned as whole bag (no properties)", ({ value }) => {
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: value as any,
			} as any),
		).toBe(value);
	});

	it("parameters NaN is falsy → {}", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: Number.NaN as any,
			} as any),
		).toEqual({});
	});

	it("parameters Object(true) kept by identity (truthy, no .properties)", () => {
		const boxed = Object(true);
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: boxed as any,
			} as any),
		).toBe(boxed);
	});

	it("parameters {} kept by identity (truthy empty bag)", () => {
		const empty = {};
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: empty as any,
			} as any),
		).toBe(empty);
	});
});
