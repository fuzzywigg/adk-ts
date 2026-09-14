import type { Content, FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";
import { LlmResponse } from "../../models/llm-response";

/**
 * Fifteenth leftover: formatResponsePreview `!content` treats `0`/`false`/`""`
 * as none; formatContentPreview requires `parts && Array.isArray(parts)` so
 * null/non-array parts fall through to JSON.stringify; empty-string text still
 * wins getPartType over functionCall via `!== undefined`.
 */
describe("LogFormatter content/parts array-gate fifteenth leftover", () => {
	it.each([
		{ label: "0", content: 0 },
		{ label: "false", content: false },
		{ label: '""', content: "" },
	] as const)("formatResponsePreview content=$label → none via !content", ({
		content,
	}) => {
		expect(
			LogFormatter.formatResponsePreview({
				content,
			} as unknown as LlmResponse),
		).toBe("none");
	});

	it("parts: null skips Array.isArray path → JSON.stringify fallback", () => {
		const content = { role: "user", parts: null } as unknown as Content;
		const result = LogFormatter.formatContentPreview(content);
		expect(result).toContain('"parts":null');
		expect(result).not.toBe("no text content");
		expect(result).not.toBe("none");
	});

	it.each([
		{ label: "object", parts: { text: "hi" } },
		{ label: "string", parts: "hi" },
	] as const)("truthy non-array parts=$label → JSON fallback (not text join)", ({
		parts,
	}) => {
		const content = { role: "user", parts } as unknown as Content;
		const result = LogFormatter.formatContentPreview(content);
		expect(result).toBe(JSON.stringify(content).substring(0, 80));
		expect(result).not.toBe("hi");
		expect(result).not.toBe("no text content");
	});

	it("empty-string text wins getPartType over co-located functionCall (text !== undefined)", () => {
		const part = {
			text: "",
			functionCall: { name: "x", args: {} },
		} as Part & { functionCall: FunctionCall };
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [part],
		});
		expect(lines[0]).toMatch(/^\[0\] text: ""$/);
		expect(lines[0]).not.toContain("function_call");
		expect(lines[0]).not.toContain("x(");
	});
});
