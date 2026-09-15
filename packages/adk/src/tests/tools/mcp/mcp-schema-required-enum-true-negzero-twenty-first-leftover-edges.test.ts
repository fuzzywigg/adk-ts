import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twenty-first leftover (HEAVY tip-relaunch residual after thirteenth
 * `required: []` / eighth `enum: []`): object `if (schema.required)` and
 * string/number `if (schema.enum)` — boolean `true` / `"true"` / `[]` /
 * `NEGATIVE_INFINITY` kept; SameValueZero `-0` dropped.
 */
describe("mcp schema required/enum true/negzero twenty-first leftover", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("object required $label kept via truthy if", ({ value }) => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				required: value as any,
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
			required: value,
		});
	});

	it("object required -0 dropped (SameValueZero falsy)", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				required: -0 as any,
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("string enum $label kept via truthy if", ({ value }) => {
		expect(
			normalizeJsonSchema({
				type: "string",
				enum: value as any,
			}),
		).toEqual({
			type: Type.STRING,
			enum: value,
		});
	});

	it("string enum -0 dropped (SameValueZero falsy)", () => {
		expect(
			normalizeJsonSchema({
				type: "string",
				enum: -0 as any,
			}),
		).toEqual({
			type: Type.STRING,
		});
	});
});
