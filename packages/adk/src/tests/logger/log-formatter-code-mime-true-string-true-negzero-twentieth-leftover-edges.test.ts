import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Twentieth leftover residual after tip #279 / 1f70668 (#282):
 * fifteenth/seventeenth pinned falsy/`"0"`/`"false"` for `code ||` /
 * `mimeType ||`. Residual: true/`"true"`/`[]` keep via truthy `||`;
 * SameValueZero `-0` coalesces to `""` / `unknown type`; part.text true/
 * `"true"`/`[]`/`-0` via `!== undefined` (not falsy gate).
 */
describe("LogFormatter code/mime/text true/string-true/negzero twentieth leftover", () => {
	it.each([
		{ label: "boolean true", code: true, expected: '"true"' },
		{ label: '"true"', code: "true", expected: '"true"' },
		{ label: "empty array", code: [], expected: '""' },
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

	it("executableCode.code=-0 coalesces via || to empty string", () => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ executableCode: { code: -0, language: "PYTHON" } as any }],
		});
		expect(lines[0]).toContain('executable_code: ""');
	});

	it.each([
		{ label: "boolean true", mimeType: true, expected: "file: true" },
		{ label: '"true"', mimeType: "true", expected: "file: true" },
		{ label: "empty array", mimeType: [], expected: "file: " },
	] as const)("mimeType=$label kept via ||", ({ mimeType, expected }) => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "gs://x", mimeType } as any }],
		});
		expect(lines[0]).toContain(expected);
		expect(lines[0]).not.toContain("unknown type");
	});

	it("mimeType=-0 coalesces via || to unknown type", () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "gs://x", mimeType: -0 } as any }],
		});
		expect(lines[0]).toContain("file: unknown type");
	});

	it.each([
		{ label: "boolean true", text: true, expected: '"true"' },
		{ label: '"true"', text: "true", expected: '"true"' },
		{ label: "-0", text: -0, expected: '"0"' },
		{ label: "empty array", text: [], expected: '""' },
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
