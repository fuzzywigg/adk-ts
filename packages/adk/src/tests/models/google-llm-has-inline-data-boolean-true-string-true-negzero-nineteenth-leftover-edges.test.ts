import { afterEach, describe, expect, it } from "vitest";
import { GoogleLlm } from "../../models/google-llm";

afterEach(() => {
	process.env.GOOGLE_API_KEY = undefined;
	process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
});

/**
 * Nineteenth leftover (complement #252 after tip #251):
 * `parts?.some(part => part.inlineData) || false`. Tenth pinned classic
 * falsy/object truthiness. Residual inlineData boolean-true / `"true"` / `[]`
 * / `-Infinity` → true via `.some`; SameValueZero `-0` → false.
 */
describe("google-llm hasInlineData boolean-true/string-true/negzero nineteenth leftover edges", () => {
	function llm() {
		process.env.GOOGLE_API_KEY = "abc";
		return new GoogleLlm();
	}

	it.each([
		{ label: "boolean true", inlineData: true as any, expected: true },
		{ label: "string true", inlineData: "true" as any, expected: true },
		{ label: "empty array", inlineData: [] as any, expected: true },
		{
			label: "NEGATIVE_INFINITY",
			inlineData: Number.NEGATIVE_INFINITY as any,
			expected: true,
		},
		{ label: "-0", inlineData: -0 as any, expected: false },
	])("inlineData $label → $expected", ({ inlineData, expected }) => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [{ content: { parts: [{ inlineData }] } }],
			}),
		).toBe(expected);
	});
});
