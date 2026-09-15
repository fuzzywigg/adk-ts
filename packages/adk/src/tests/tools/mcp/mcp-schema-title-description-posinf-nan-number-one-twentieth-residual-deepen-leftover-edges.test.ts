import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * HEAVY tip-relaunch residual deepen after tip 5156762 / post #292 (lands closed #290/#278 onto tip; complements #259 true/negzero):
 * object/string `if (schema.title)` / `if (schema.description)` —
 * POSITIVE_INFINITY / `1` / `{}` / `Object(true)` kept; `NaN` dropped.
 */
describe("mcp schema title/description posinf/nan/number-one twentieth residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("object title/description $label kept via truthy if", ({ value }) => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				title: value,
				description: value,
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
			title: value,
			description: value,
		});
	});

	it("object title/description NaN dropped (falsy if)", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				title: Number.NaN as any,
				description: Number.NaN as any,
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
	])("string title/description $label kept via truthy if", ({ value }) => {
		expect(
			normalizeJsonSchema({
				type: "string",
				title: value,
				description: value,
			}),
		).toEqual({
			type: Type.STRING,
			title: value,
			description: value,
		});
	});
});
