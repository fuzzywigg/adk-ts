import type { Content } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Nineteenth leftover residual after tip #261 / #253:
 * #261 pinned formatContentPreview Array.isArray for true/"true"/[]/-0
 * (JSON fallback vs no-text). Residual: formatContentParts `!parts` then
 * `.map` — truthy non-array throws; SameValueZero `-0` → "no parts";
 * `[]` maps to empty (sixteenth control twin).
 */
describe("LogFormatter content-parts true/string-true/negzero throw nineteenth leftover", () => {
	it.each([
		{ label: "boolean true", parts: true },
		{ label: '"true"', parts: "true" },
		{ label: "number 1", parts: 1 },
		{ label: "Infinity", parts: Number.POSITIVE_INFINITY },
		{ label: "-Infinity", parts: Number.NEGATIVE_INFINITY },
		{ label: "plain object", parts: { text: "hi" } },
	] as const)("formatContentParts parts=$label throws (.map not a function)", ({
		parts,
	}) => {
		expect(() =>
			LogFormatter.formatContentParts({
				role: "user",
				parts,
			} as unknown as Content),
		).toThrow(/map is not a function/);
	});

	it("formatContentParts parts=-0 → no parts via !parts (SameValueZero)", () => {
		expect(
			LogFormatter.formatContentParts({
				role: "user",
				parts: -0,
			} as unknown as Content),
		).toEqual(["no parts"]);
	});

	it("formatContentParts parts=[] → [] (truthy array, not !parts / not throw)", () => {
		expect(
			LogFormatter.formatContentParts({
				role: "user",
				parts: [],
			}),
		).toEqual([]);
	});
});
