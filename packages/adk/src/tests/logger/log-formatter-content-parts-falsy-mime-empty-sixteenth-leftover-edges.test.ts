import type { Content, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Sixteenth leftover: formatContentParts `!content.parts` treats falsy
 * primitives as "no parts" (fifteenth covered formatResponsePreview
 * !content and formatContentPreview Array.isArray). Empty-string mimeType
 * falls through `|| "unknown type"` (fifteenth covered 0/false/"0" only).
 * Truthy non-array parts throws on .map (contrast preview JSON fallback).
 */
describe("LogFormatter content-parts falsy / mime empty sixteenth leftover", () => {
	it.each([
		{ label: "0", parts: 0 },
		{ label: "false", parts: false },
		{ label: '""', parts: "" },
		{ label: "null", parts: null },
	] as const)("formatContentParts parts=$label → no parts via !parts", ({
		parts,
	}) => {
		expect(
			LogFormatter.formatContentParts({
				role: "user",
				parts,
			} as unknown as Content),
		).toEqual(["no parts"]);
	});

	it("empty-array parts maps to [] (truthy array, not !parts)", () => {
		expect(
			LogFormatter.formatContentParts({
				role: "user",
				parts: [],
			}),
		).toEqual([]);
	});

	it('fileData mimeType="" coalesces via || to unknown type', () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "gs://x", mimeType: "" } as any }],
		});
		expect(lines[0]).toContain("file: unknown type");
	});

	it("truthy non-array parts throws on .map (unlike formatContentPreview JSON path)", () => {
		expect(() =>
			LogFormatter.formatContentParts({
				role: "user",
				parts: { text: "hi" },
			} as unknown as Content),
		).toThrow();
	});

	it("empty parts entry still indexed as unknown (sparse-ish object part)", () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{} as Part],
		});
		expect(lines[0]).toBe("[0] unknown: unknown content");
	});
});
