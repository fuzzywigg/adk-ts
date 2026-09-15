import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { jsonSchemaToDeclaration } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after providers tip #269):
 * `if (schema)` wrap — complements closed #271 true/`"true"`/`-Infinity` wrap /
 * `-0` empty with `POSITIVE_INFINITY` / `1` / `[]` wrap; `NaN`→empty default;
 * `Object(true)` wrap by identity as properties bag.
 */
describe("mcp jsonschema schema nan/posinf wrap twentieth leftover heavy", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty array", value: [] as never[] },
	])("wraps schema $label as properties bag", ({ value }) => {
		expect(jsonSchemaToDeclaration("n", "d", value as any).parameters).toEqual({
			type: Type.OBJECT,
			properties: value,
		});
	});

	it("schema NaN is falsy → empty object parameters", () => {
		expect(
			jsonSchemaToDeclaration("n", "d", Number.NaN as any).parameters,
		).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("schema Object(true) wrapped as properties bag by identity", () => {
		const boxed = Object(true);
		expect(jsonSchemaToDeclaration("n", "d", boxed as any).parameters).toEqual({
			type: Type.OBJECT,
			properties: boxed,
		});
	});
});
