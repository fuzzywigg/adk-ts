import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";

/**
 * Thirteenth leftover: extractTextFromContent fallback `String(content || "")`.
 * Seventh leftover only pinned `part.text || ""` inside parts.
 */
describe("llm-request extractTextFromContent primitive || thirteenth leftover edges", () => {
	it.each([
		{ label: "0", value: 0, expected: "" },
		{ label: "false", value: false, expected: "" },
		{ label: "null", value: null, expected: "" },
		{ label: "undefined", value: undefined, expected: "" },
		{ label: "NaN", value: Number.NaN, expected: "" },
	])('$label falls through || "" then String → empty', ({
		value,
		expected,
	}) => {
		expect(LlmRequest.extractTextFromContent(value)).toBe(expected);
	});

	it("whitespace string is returned as-is (string branch, not fallback)", () => {
		expect(LlmRequest.extractTextFromContent(" ")).toBe(" ");
	});

	it('truthy number 1 uses String(content || "") → "1"', () => {
		expect(LlmRequest.extractTextFromContent(1)).toBe("1");
	});

	it('string "0" stays "0" (string branch)', () => {
		expect(LlmRequest.extractTextFromContent("0")).toBe("0");
	});

	it("object without parts uses String(object) not empty", () => {
		expect(LlmRequest.extractTextFromContent({ role: "user" })).toBe(
			"[object Object]",
		);
	});
});
