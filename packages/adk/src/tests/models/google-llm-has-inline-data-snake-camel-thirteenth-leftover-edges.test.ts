import { afterEach, describe, expect, it } from "vitest";
import { GoogleLlm } from "../../models/google-llm";

afterEach(() => {
	process.env.GOOGLE_API_KEY = undefined;
	process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
});

/**
 * Thirteenth leftover: hasInlineData only reads camel `inlineData`.
 * Snake `inline_data` is ignored even when populated.
 */
describe("google-llm hasInlineData snake vs camel thirteenth leftover edges", () => {
	function llm() {
		process.env.GOOGLE_API_KEY = "abc";
		return new GoogleLlm();
	}

	it("snake inline_data alone is ignored", () => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [
					{
						content: {
							parts: [{ inline_data: { data: "x", mime_type: "image/png" } }],
						},
					},
				],
			}),
		).toBe(false);
	});

	it("camel inlineData {} still wins (tenth control)", () => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [{ content: { parts: [{ inlineData: {} }] } }],
			}),
		).toBe(true);
	});

	it("camel + snake on the same part is true via camel", () => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [
					{
						content: {
							parts: [
								{
									inline_data: { data: "snake" },
									inlineData: { data: "camel" },
								},
							],
						},
					},
				],
			}),
		).toBe(true);
	});

	it("falsy camel with truthy snake stays false", () => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [
					{
						content: {
							parts: [{ inlineData: null, inline_data: { data: "bytes" } }],
						},
					},
				],
			}),
		).toBe(false);
	});
});
