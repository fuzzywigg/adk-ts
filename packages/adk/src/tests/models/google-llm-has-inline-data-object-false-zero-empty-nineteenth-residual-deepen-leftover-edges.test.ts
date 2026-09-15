import { afterEach, describe, expect, it } from "vitest";
import { GoogleLlm } from "../../models/google-llm";

afterEach(() => {
	process.env.GOOGLE_API_KEY = undefined;
	process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
});

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `parts?.some(part => part.inlineData) || false` — boxed-falsy /
 * `"-Infinity"` / `-1` → true via `.some`.
 */
describe("google-llm hasInlineData object-false/zero/empty nineteenth residual deepen", () => {
	function llm() {
		process.env.GOOGLE_API_KEY = "abc";
		return new GoogleLlm();
	}

	it.each([
		{ label: "Object(false)", inlineData: Object(false) as any },
		{ label: "Object(0)", inlineData: Object(0) as any },
		{ label: 'Object("")', inlineData: Object("") as any },
		{ label: "Object(NaN)", inlineData: Object(Number.NaN) as any },
		{ label: 'string "-Infinity"', inlineData: "-Infinity" as any },
		{ label: "number -1", inlineData: -1 as any },
	])("inlineData $label → true", ({ inlineData }) => {
		expect(
			(llm() as any).hasInlineData({
				candidates: [{ content: { parts: [{ inlineData }] } }],
			}),
		).toBe(true);
	});
});
