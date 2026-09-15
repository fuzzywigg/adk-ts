import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Nineteenth leftover residual deepen after tip #289 / f93c037:
 * tip pinned code/mime/text true/`"true"`/`[]`/`-0`. Residual: +Infinity /
 * {} / Object(true) / 1 keep via `||` / `!== undefined`; NaN coalesces at
 * `||` (code/mime) but keeps via text `!== undefined`.
 */
describe("LogFormatter code/mime/text posinf/nan/object-true nineteenth residual deepen", () => {
	it.each([
		{
			label: "Infinity",
			code: Number.POSITIVE_INFINITY,
			expected: '"Infinity"',
		},
		{ label: "empty object", code: {}, expected: '"[object Object]"' },
		{ label: "Object(true)", code: Object(true), expected: '"true"' },
		{ label: "number 1", code: 1, expected: '"1"' },
	] as const)("executableCode.code=$label kept via ||", ({
		code,
		expected,
	}) => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ executableCode: { code, language: "PYTHON" } as any }],
		});
		expect(lines[0]).toContain(`executable_code: ${expected}`);
	});

	it("executableCode.code=NaN coalesces via || to empty string", () => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [
				{ executableCode: { code: Number.NaN, language: "PYTHON" } as any },
			],
		});
		expect(lines[0]).toContain('executable_code: ""');
	});

	it.each([
		{
			label: "Infinity",
			mimeType: Number.POSITIVE_INFINITY,
			expected: "file: Infinity",
		},
		{ label: "empty object", mimeType: {}, expected: "file: [object Object]" },
		{ label: "Object(true)", mimeType: Object(true), expected: "file: true" },
		{ label: "number 1", mimeType: 1, expected: "file: 1" },
	] as const)("mimeType=$label kept via ||", ({ mimeType, expected }) => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "gs://x", mimeType } as any }],
		});
		expect(lines[0]).toContain(expected);
		expect(lines[0]).not.toContain("unknown type");
	});

	it("mimeType=NaN coalesces via || to unknown type", () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "gs://x", mimeType: Number.NaN } as any }],
		});
		expect(lines[0]).toContain("file: unknown type");
	});

	it.each([
		{
			label: "Infinity",
			text: Number.POSITIVE_INFINITY,
			expected: '"Infinity"',
		},
		{ label: "NaN", text: Number.NaN, expected: '"NaN"' },
		{ label: "empty object", text: {}, expected: '"[object Object]"' },
		{ label: "Object(true)", text: Object(true), expected: '"true"' },
		{ label: "number 1", text: 1, expected: '"1"' },
	] as const)("part.text=$label kept via !== undefined (not !text)", ({
		text,
		expected,
	}) => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ text } as any],
		});
		expect(lines[0]).toBe(`[0] text: ${expected}`);
	});
});
