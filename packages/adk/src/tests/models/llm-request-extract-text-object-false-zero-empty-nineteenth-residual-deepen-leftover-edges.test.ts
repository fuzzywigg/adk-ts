import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `String(content || "")` / `parts[].text || ""` — boxed-falsy /
 * `"-Infinity"` / `-1` residual asymmetries.
 */
describe("llm-request extract-text object-false/zero/empty nineteenth residual deepen", () => {
	it('Object(false) uses String(content || "") → "false"', () => {
		expect(LlmRequest.extractTextFromContent(Object(false))).toBe("false");
	});

	it('Object(0) uses String(content || "") → "0"', () => {
		expect(LlmRequest.extractTextFromContent(Object(0))).toBe("0");
	});

	it('Object("") uses String(content || "") → ""', () => {
		expect(LlmRequest.extractTextFromContent(Object(""))).toBe("");
	});

	it('Object(NaN) uses String(content || "") → "NaN"', () => {
		expect(LlmRequest.extractTextFromContent(Object(Number.NaN))).toBe("NaN");
	});

	it('string "-Infinity" stays via string branch', () => {
		expect(LlmRequest.extractTextFromContent("-Infinity")).toBe("-Infinity");
	});

	it('number -1 uses String(content || "") → "-1"', () => {
		expect(LlmRequest.extractTextFromContent(-1)).toBe("-1");
	});

	it.each([
		{ label: "Object(false)", text: Object(false) as any, expected: "false" },
		{ label: "Object(0)", text: Object(0) as any, expected: "0" },
		{ label: 'Object("")', text: Object("") as any, expected: "" },
		{
			label: "Object(NaN)",
			text: Object(Number.NaN) as any,
			expected: "NaN",
		},
		{ label: 'string "-Infinity"', text: "-Infinity", expected: "-Infinity" },
		{ label: "number -1", text: -1 as any, expected: "-1" },
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
