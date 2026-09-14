import { afterEach, describe, expect, it } from "vitest";
import { GoogleLlm } from "../../models/google-llm";

afterEach(() => {
	process.env.GOOGLE_API_KEY = undefined;
	process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
});

/**
 * Tenth leftover: parts?.some(part => part.inlineData) || false — truthiness of
 * inlineData itself ({} vs null/""/0/false), beyond happy/missing shapes.
 */
describe("google-llm hasInlineData falsy-truthiness tenth leftover edges", () => {
	function llm() {
		process.env.GOOGLE_API_KEY = "abc";
		return new GoogleLlm();
	}

	it.each([
		{
			label: "inlineData empty object",
			inlineData: {},
			expected: true,
		},
		{
			label: "inlineData with data",
			inlineData: { data: "x" },
			expected: true,
		},
		{
			label: "inlineData null",
			inlineData: null,
			expected: false,
		},
		{
			label: "inlineData undefined",
			inlineData: undefined,
			expected: false,
		},
		{
			label: "inlineData empty string",
			inlineData: "",
			expected: false,
		},
		{
			label: "inlineData 0",
			inlineData: 0,
			expected: false,
		},
		{
			label: "inlineData false",
			inlineData: false,
			expected: false,
		},
	])("$label → $expected", ({ inlineData, expected }) => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [{ content: { parts: [{ inlineData }] } }],
			}),
		).toBe(expected);
	});

	it("returns false when parts is empty or missing", () => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [{ content: { parts: [] } }],
			}),
		).toBe(false);
		expect(
			(llm() as any).hasInlineData({
				candidates: [{ content: {} }],
			}),
		).toBe(false);
	});

	it("any truthy inlineData in multi-part wins via .some", () => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [
					{
						content: {
							parts: [
								{ text: "a" },
								{ inlineData: null },
								{ inlineData: { mimeType: "image/png" } },
							],
						},
					},
				],
			}),
		).toBe(true);
	});
});
