import { describe, expect, it } from "vitest";
import { LlmResponse } from "../../models/llm-response";

/**
 * Nineteenth leftover (complement #252 after tip #251): fromError
 * `options.model || "unknown"` / `options.errorCode || "UNKNOWN_ERROR"`.
 * Thirteenth pinned classic falsy + whitespace/`"0"`. Residual boolean-true /
 * `"true"` / `[]` / `-Infinity` keep; SameValueZero `-0` collapses.
 */
describe("llm-response fromError boolean-true/string-true/negzero nineteenth leftover edges", () => {
	it.each([
		{ label: "boolean true", model: true as any, expected: "true" },
		{ label: "string true", model: "true", expected: "true" },
		{ label: "empty array", model: [] as any, expected: "" },
		{
			label: "NEGATIVE_INFINITY",
			model: Number.NEGATIVE_INFINITY as any,
			expected: "-Infinity",
		},
		{ label: "-0", model: -0 as any, expected: "unknown" },
	])("model || unknown ($label)", ({ model, expected }) => {
		const resp = LlmResponse.fromError(new Error("e"), { model });
		expect(resp.errorMessage).toContain(`model ${expected}`);
	});

	it.each([
		{ label: "boolean true", errorCode: true as any, expected: true },
		{ label: "string true", errorCode: "true", expected: "true" },
		{ label: "empty array", errorCode: [] as any, expected: [] },
		{
			label: "NEGATIVE_INFINITY",
			errorCode: Number.NEGATIVE_INFINITY as any,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "-0", errorCode: -0 as any, expected: "UNKNOWN_ERROR" },
	])("errorCode || UNKNOWN_ERROR ($label)", ({ errorCode, expected }) => {
		expect(LlmResponse.fromError("x", { errorCode }).errorCode).toEqual(
			expected,
		);
	});
});
