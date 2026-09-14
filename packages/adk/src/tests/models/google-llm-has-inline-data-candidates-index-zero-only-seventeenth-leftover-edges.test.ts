import { afterEach, describe, expect, it } from "vitest";
import { GoogleLlm } from "../../models/google-llm";

afterEach(() => {
	process.env.GOOGLE_API_KEY = undefined;
	process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
});

/**
 * Seventeenth leftover: hasInlineData reads candidates[0] only — inlineData
 * solely on candidates[1] is invisible. Tenth pinned inlineData truthiness on
 * [0]; fifteenth stream parts[0] text — not candidate index.
 */
describe("google-llm has-inline-data candidates index-zero-only seventeenth leftover edges", () => {
	function llm() {
		process.env.GOOGLE_API_KEY = "abc";
		return new GoogleLlm();
	}

	it("inlineData only on candidates[1] → false", () => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [
					{ content: { parts: [{ text: "no-inline" }] } },
					{
						content: {
							parts: [{ inlineData: { mimeType: "image/png", data: "x" } }],
						},
					},
				],
			}),
		).toBe(false);
	});

	it("inlineData on candidates[0] → true even if [1] empty", () => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [
					{
						content: {
							parts: [{ inlineData: { mimeType: "image/png", data: "x" } }],
						},
					},
					{ content: { parts: [{ text: "other" }] } },
				],
			}),
		).toBe(true);
	});

	it("missing candidates[0] with populated [1] → false", () => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [
					undefined,
					{
						content: {
							parts: [{ inlineData: { data: "x" } }],
						},
					},
				],
			}),
		).toBe(false);
	});
});
