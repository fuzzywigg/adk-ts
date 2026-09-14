import { afterEach, describe, expect, it } from "vitest";
import { GoogleLlm } from "../../models/google-llm";

afterEach(() => {
	process.env.GOOGLE_API_KEY = undefined;
	process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
});

/**
 * Fourteenth leftover: hasInlineData only inspects candidates[0]. Inline on
 * candidates[1] alone is ignored. Thirteenth covered snake/camel on parts.
 */
describe("google-llm hasInlineData candidates index-zero fourteenth leftover edges", () => {
	function llm() {
		process.env.GOOGLE_API_KEY = "abc";
		return new GoogleLlm();
	}

	it("inlineData only on candidates[1] is ignored", () => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [
					{ content: { parts: [{ text: "no-inline" }] } },
					{ content: { parts: [{ inlineData: { data: "x" } }] } },
				],
			}),
		).toBe(false);
	});

	it("inlineData on candidates[0] is true (control)", () => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [
					{ content: { parts: [{ inlineData: { data: "x" } }] } },
					{ content: { parts: [{ text: "ignored" }] } },
				],
			}),
		).toBe(true);
	});

	it("empty candidates[0] parts with populated [1] stays false", () => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [
					{ content: { parts: [] } },
					{ content: { parts: [{ inlineData: {} }] } },
				],
			}),
		).toBe(false);
	});
});
