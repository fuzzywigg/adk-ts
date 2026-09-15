import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twenty-first leftover (HEAVY tip-relaunch residual after twentieth typed
 * string pattern keep / eighth empty-pattern OBJECT): untyped
 * `determineSchemaType` `if (schema.pattern)` — `true` / `"true"` / `[]` /
 * `NEGATIVE_INFINITY` → STRING; SameValueZero `-0` → OBJECT default.
 */
describe("mcp schema infer pattern true/negzero twenty-first leftover", () => {
	it.each([
		{ label: "boolean true", pattern: true },
		{ label: '"true"', pattern: "true" },
		{ label: "empty array", pattern: [] as never[] },
		{ label: "NEGATIVE_INFINITY", pattern: Number.NEGATIVE_INFINITY },
	])("untyped pattern $label → determineSchemaType STRING", ({ pattern }) => {
		expect(normalizeJsonSchema({ pattern } as any)).toEqual({
			type: Type.STRING,
			pattern,
		});
	});

	it("untyped pattern -0 is falsy → OBJECT default (no STRING infer; keeps -0)", () => {
		expect(normalizeJsonSchema({ pattern: -0 as any })).toEqual({
			type: Type.OBJECT,
			pattern: -0,
		});
	});
});
