import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * HEAVY tip-relaunch residual deepen after tip 1f70668 / post #286 (lands closed #278 onto tip; complements #259 true/negzero):
 * typed string `if (schema.pattern)` / `if (schema.format)` —
 * POSITIVE_INFINITY / `1` / `{}` / `Object(true)` kept; `NaN` dropped.
 */
describe("mcp schema pattern/format posinf/nan/object-true twentieth residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("pattern/format $label kept via truthy if", ({ value }) => {
		expect(
			normalizeJsonSchema({
				type: "string",
				pattern: value,
				format: value,
			}),
		).toEqual({
			type: Type.STRING,
			pattern: value,
			format: value,
		});
	});

	it("pattern/format NaN dropped (falsy if)", () => {
		expect(
			normalizeJsonSchema({
				type: "string",
				pattern: Number.NaN as any,
				format: Number.NaN as any,
			}),
		).toEqual({
			type: Type.STRING,
		});
	});
});
