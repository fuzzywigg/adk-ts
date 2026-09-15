import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after eighth empty-string drop):
 * object/string `if (schema.title)` / `if (schema.description)` — boolean
 * `true` / `"true"` / `[]` / `NEGATIVE_INFINITY` kept; `-0` dropped. Eighth
 * pinned empty-string drop; nineteenth covered pattern/format string-zero only.
 */
describe("mcp schema title/description true/negzero twentieth leftover", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
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

	it("object title/description -0 dropped (SameValueZero falsy)", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				title: -0 as any,
				description: -0 as any,
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
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
