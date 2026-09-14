import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { jsonSchemaToDeclaration } from "../../../tools/mcp/schema-conversion";

const emptyObjectParameters = {
	type: Type.OBJECT,
	properties: {},
};

/**
 * Eleventh leftover: `if (schema)` is truthiness. Falsy schemas (null/0/""/
 * false) take the empty-object default; truthy non-objects wrap as properties.
 * Distinct from the Type-enum wrap trap (string `type` gate) and `{}`.
 */
describe("jsonSchemaToDeclaration falsy schema eleventh leftover", () => {
	it.each([
		{ label: "null", schema: null },
		{ label: "undefined", schema: undefined },
		{ label: "0", schema: 0 },
		{ label: "false", schema: false },
		{ label: "empty string", schema: "" },
	])("defaults $label schema to empty object parameters", ({ schema }) => {
		expect(jsonSchemaToDeclaration("n", "d", schema as any).parameters).toEqual(
			emptyObjectParameters,
		);
	});

	it("wraps a truthy array schema as the properties bag", () => {
		expect(jsonSchemaToDeclaration("n", "d", [] as any).parameters).toEqual({
			type: Type.OBJECT,
			properties: [],
		});
	});

	it("wraps a truthy number schema as the properties bag", () => {
		expect(jsonSchemaToDeclaration("n", "d", 1 as any).parameters).toEqual({
			type: Type.OBJECT,
			properties: 1,
		});
	});

	it("preserves a string-typed schema object (control)", () => {
		expect(
			jsonSchemaToDeclaration("n", "d", {
				type: "string",
				minLength: 0,
			}).parameters,
		).toEqual({
			type: "string",
			minLength: 0,
		});
	});
});
