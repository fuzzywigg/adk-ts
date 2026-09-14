import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";

/**
 * Nineteenth leftover (complement #252 after tip #251):
 * `String(content || "")` fallback in extractTextFromContent. Thirteenth pinned
 * classic falsy + number `1`. Residual boolean-true / `"true"` string-branch /
 * `[]` array-branch / `-Infinity` / `-0` coalesce asymmetries.
 */
describe("llm-request extract-text boolean-true/string-true/negzero nineteenth leftover edges", () => {
	it('boolean true uses String(content || "") → "true"', () => {
		expect(LlmRequest.extractTextFromContent(true)).toBe("true");
	});

	it('string "true" stays via string branch', () => {
		expect(LlmRequest.extractTextFromContent("true")).toBe("true");
	});

	it("empty array uses array branch → empty join (no text parts)", () => {
		expect(LlmRequest.extractTextFromContent([])).toBe("");
	});

	it('NEGATIVE_INFINITY uses String(content || "") → "-Infinity"', () => {
		expect(LlmRequest.extractTextFromContent(Number.NEGATIVE_INFINITY)).toBe(
			"-Infinity",
		);
	});

	it('SameValueZero -0 falls through || "" then String → empty', () => {
		expect(LlmRequest.extractTextFromContent(-0)).toBe("");
	});

	it.each([
		{ label: "boolean true", text: true as any, expected: "true" },
		{ label: "string true", text: "true", expected: "true" },
		{ label: "empty array", text: [] as any, expected: "" },
		{
			label: "NEGATIVE_INFINITY",
			text: Number.NEGATIVE_INFINITY as any,
			expected: "-Infinity",
		},
		{ label: "-0", text: -0 as any, expected: "" },
	])('parts[].text || "" then filter(Boolean)/join ($label)', ({
		text,
		expected,
	}) => {
		expect(
			LlmRequest.extractTextFromContent({
				role: "user",
				parts: [{ text }],
			}),
		).toBe(expected);
	});
});
