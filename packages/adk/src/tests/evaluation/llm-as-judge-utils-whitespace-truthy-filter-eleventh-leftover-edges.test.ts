import { describe, expect, it } from "vitest";
import { getTextFromContent } from "../../evaluation/llm-as-judge-utils";

/**
 * Eleventh leftover: getTextFromContent `filter(Boolean)` — seventh leftover
 * drops ""/undefined; whitespace " " and "0" are truthy and kept.
 */
describe("llm-as-judge-utils whitespace truthy filter eleventh leftover edges", () => {
	it('keeps whitespace-only part text " " via filter(Boolean)', () => {
		expect(
			getTextFromContent({
				parts: [{ text: " " }, { text: "" }, { text: "x" }],
			}),
		).toBe(" \nx");
	});

	it('keeps string "0" via filter(Boolean)', () => {
		expect(
			getTextFromContent({
				parts: [{ text: "0" }, { text: "" }, { text: "1" }],
			}),
		).toBe("0\n1");
	});

	it.each([
		{ label: "empty string", text: "" },
		{ label: "null", text: null as any },
		{ label: "undefined", text: undefined as any },
		{ label: "false", text: false as any },
		{ label: "0 number", text: 0 as any },
	])("drops falsy part text ($label)", ({ text }) => {
		expect(
			getTextFromContent({
				parts: [{ text }, { text: "keep" }],
			}),
		).toBe("keep");
	});

	it("joins multiple whitespace-kept parts", () => {
		expect(
			getTextFromContent({
				parts: [{ text: " " }, { text: "\t" }, { text: "\n" }],
			}),
		).toBe(" \n\t\n\n");
	});
});
