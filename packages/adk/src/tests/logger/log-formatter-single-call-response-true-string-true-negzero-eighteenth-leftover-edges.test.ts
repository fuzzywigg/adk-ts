import type { Content, FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";
import { LlmResponse } from "../../models/llm-response";

/**
 * Eighteenth leftover residual deepen (complements open #253):
 * #253 pinned formatFunctionCalls / formatFunctionResponse / formatContentPreview
 * text filter. Residual: formatSingleFunctionCall `args ?`; formatResponsePreview
 * `!content`; parts `Array.isArray` gate; top-level `!functionCalls`;
 * formatContentParts text:true preview.
 */
describe("LogFormatter single-call/response true/string-true/negzero eighteenth leftover", () => {
	it.each([
		{ label: "boolean true", args: true, body: "true" },
		{ label: '"true"', args: "true", body: '"true"' },
		{ label: "empty array", args: [], body: "[]" },
		{
			label: "Infinity",
			args: Number.POSITIVE_INFINITY,
			body: "null",
		},
		{
			label: "-Infinity",
			args: Number.NEGATIVE_INFINITY,
			body: "null",
		},
	] as const)("formatSingleFunctionCall args=$label pretty-keeps (not {})", ({
		args,
		body,
	}) => {
		expect(
			LogFormatter.formatSingleFunctionCall({
				name: "fn",
				args,
			} as unknown as FunctionCall),
		).toBe(`fn(\n${body}\n)`);
	});

	it("formatSingleFunctionCall args=-0 coalesces to pretty {}", () => {
		expect(
			LogFormatter.formatSingleFunctionCall({
				name: "fn",
				args: -0,
			} as unknown as FunctionCall),
		).toBe("fn(\n{}\n)");
	});

	it.each([
		{ label: "boolean true", content: true, expected: "true" },
		{ label: '"true"', content: "true", expected: '"true"' },
		{ label: "empty array", content: [], expected: "[]" },
	] as const)("formatResponsePreview content=$label keeps via !content", ({
		content,
		expected,
	}) => {
		expect(
			LogFormatter.formatResponsePreview({
				content,
			} as unknown as LlmResponse),
		).toBe(expected);
	});

	it("formatResponsePreview content=-0 → none (SameValueZero falsy)", () => {
		expect(
			LogFormatter.formatResponsePreview({
				content: -0,
			} as unknown as LlmResponse),
		).toBe("none");
	});

	it.each([
		{ label: "boolean true", parts: true },
		{ label: '"true"', parts: "true" },
	] as const)("parts=$label → JSON fallback (Array.isArray fails)", ({
		parts,
	}) => {
		const content = { role: "user", parts } as unknown as Content;
		const result = LogFormatter.formatContentPreview(content);
		expect(result).toBe(JSON.stringify(content));
		expect(result).not.toBe("no text content");
		expect(result).not.toBe("none");
	});

	it("parts=[] → Array.isArray path → no text content", () => {
		expect(
			LogFormatter.formatContentPreview({
				role: "user",
				parts: [],
			}),
		).toBe("no text content");
	});

	it("parts=-0 falsy → JSON fallback with parts:0", () => {
		const content = { role: "user", parts: -0 } as unknown as Content;
		const result = LogFormatter.formatContentPreview(content);
		expect(result).toContain('"parts":0');
		expect(result).not.toBe("no text content");
	});

	it("formatFunctionCalls([]) → none; (-0) → none via !functionCalls", () => {
		expect(LogFormatter.formatFunctionCalls([])).toBe("none");
		expect(LogFormatter.formatFunctionCalls(-0 as any)).toBe("none");
	});

	it("formatFunctionCalls(true) throws (.filter not a function)", () => {
		expect(() => LogFormatter.formatFunctionCalls(true as any)).toThrow(
			/filter is not a function/,
		);
	});

	it('formatContentParts text:true → text: "true" (length undefined skips truncate)', () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ text: true as any } as Part],
		});
		expect(lines[0]).toBe('[0] text: "true"');
	});
});
