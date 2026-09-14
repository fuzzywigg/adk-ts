import { describe, expect, it } from "vitest";
import type { Content } from "@google/genai";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Tenth leftover: `filter((part) => part.text)` keeps truthy `"0"` / whitespace
 * but drops `""` → `"no text content"`. Distinct from length-boundary leftover.
 */
describe("LogFormatter truthy zero/whitespace text keep tenth leftover (post #176)", () => {
	it.each([
		{ label: '"0"', text: "0" },
		{ label: "space", text: " " },
		{ label: "tab", text: "\t" },
		{ label: "newline", text: "\n" },
		{ label: '"false"', text: "false" },
	] as const)("keeps truthy text $label via filter(part.text)", ({ text }) => {
		expect(
			LogFormatter.formatContentPreview({
				role: "user",
				parts: [{ text }],
			} as Content),
		).toBe(text);
	});

	it('empty string text is falsy → "no text content"', () => {
		expect(
			LogFormatter.formatContentPreview({
				role: "user",
				parts: [{ text: "" }],
			} as Content),
		).toBe("no text content");
	});

	it("mix of empty and truthy zero joins only truthy parts", () => {
		expect(
			LogFormatter.formatContentPreview({
				role: "user",
				parts: [{ text: "" }, { text: "0" }, { text: "" }, { text: " " }],
			} as Content),
		).toBe("0  ");
	});

	it("all-empty parts still yield no text content", () => {
		expect(
			LogFormatter.formatContentPreview({
				role: "user",
				parts: [{ text: "" }, { text: "" }],
			} as Content),
		).toBe("no text content");
	});
});
