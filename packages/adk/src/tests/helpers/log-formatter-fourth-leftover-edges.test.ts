import type { Content, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

describe("LogFormatter fourth leftover — mime / code / outcome / dataSize matrices", () => {
	describe("mimeType || 'unknown type'", () => {
		const mimeCases: Array<{ label: string; mimeType: any; expected: string }> =
			[
				{ label: "undefined", mimeType: undefined, expected: "unknown type" },
				{ label: "null", mimeType: null, expected: "unknown type" },
				{ label: "empty string", mimeType: "", expected: "unknown type" },
				{ label: "text/plain", mimeType: "text/plain", expected: "text/plain" },
				{ label: "image/png", mimeType: "image/png", expected: "image/png" },
				{
					label: "application/json",
					mimeType: "application/json",
					expected: "application/json",
				},
				{
					label: "custom vendor",
					mimeType: "application/vnd.adk+json",
					expected: "application/vnd.adk+json",
				},
			];

		for (const row of mimeCases) {
			it(`fileData mime: ${row.label}`, () => {
				const content: Content = {
					role: "model",
					parts: [
						{
							fileData: {
								mimeType: row.mimeType,
								fileUri: "gs://bucket/x",
							} as any,
						},
					],
				};
				const [line] = LogFormatter.formatContentParts(content);
				expect(line).toContain(`file: ${row.expected}`);
			});
		}
	});

	describe("executableCode.code || '' and dataSize truncation", () => {
		const codeSizes = [0, 1, 49, 50, 51, 60, 100];

		for (const size of codeSizes) {
			it(`code length ${size}`, () => {
				const code = size === 0 ? undefined : "c".repeat(size);
				const content: Content = {
					role: "model",
					parts: [
						{
							executableCode: {
								code: code as any,
								language: "PYTHON" as any,
							} as any,
						},
					],
				};
				const [line] = LogFormatter.formatContentParts(content);
				if (!code) {
					expect(line).toContain('executable_code: ""');
				} else if (size > 50) {
					expect(line).toContain(`"${"c".repeat(50)}..."`);
				} else {
					expect(line).toContain(`"${code}"`);
					expect(line).not.toContain("...");
				}
			});
		}

		it("explicit empty code string renders empty quotes", () => {
			const [line] = LogFormatter.formatContentParts({
				role: "model",
				parts: [
					{
						executableCode: {
							code: "",
							language: "PYTHON" as any,
						},
					},
				],
			});
			expect(line).toContain('executable_code: ""');
		});

		it("null code coalesces via || ''", () => {
			const [line] = LogFormatter.formatContentParts({
				role: "model",
				parts: [
					{
						executableCode: {
							code: null as any,
							language: "PYTHON" as any,
						} as any,
					},
				],
			});
			expect(line).toContain('executable_code: ""');
		});
	});

	describe("outcome || 'unknown' matrix", () => {
		const outcomes: Array<{ label: string; outcome: any; expected: string }> = [
			{ label: "undefined", outcome: undefined, expected: "unknown" },
			{ label: "null", outcome: null, expected: "unknown" },
			{ label: "empty string", outcome: "", expected: "unknown" },
			{ label: "0 number falsy", outcome: 0, expected: "unknown" },
			{ label: "false", outcome: false, expected: "unknown" },
			{ label: "OUTCOME_OK", outcome: "OUTCOME_OK", expected: "OUTCOME_OK" },
			{
				label: "OUTCOME_FAILED",
				outcome: "OUTCOME_FAILED",
				expected: "OUTCOME_FAILED",
			},
			{ label: "OK shorthand", outcome: "OK", expected: "OK" },
			{ label: "numeric truthy", outcome: 1, expected: "1" },
		];

		for (const row of outcomes) {
			it(`outcome=${row.label}`, () => {
				const content: Content = {
					role: "model",
					parts: [
						{
							codeExecutionResult: {
								outcome: row.outcome,
								output: "x",
							} as any,
						},
					],
				};
				const [line] = LogFormatter.formatContentParts(content);
				expect(line).toContain(`execution result: ${row.expected}`);
			});
		}
	});

	describe("text / args dataSize truncation boundaries", () => {
		const textSizes = [0, 1, 49, 50, 51];
		for (const size of textSizes) {
			it(`part text preview size ${size}`, () => {
				const text = "t".repeat(size);
				const [line] = LogFormatter.formatContentParts({
					role: "user",
					parts: [{ text }],
				});
				if (size > 50) {
					expect(line).toBe(`[0] text: "${"t".repeat(50)}..."`);
				} else {
					expect(line).toBe(`[0] text: "${text}"`);
				}
			});
		}

		const previewSizes = [0, 79, 80, 81, 120];
		for (const size of previewSizes) {
			it(`formatContentPreview dataSize ${size}`, () => {
				const text = "p".repeat(size);
				const preview = LogFormatter.formatContentPreview({
					role: "user",
					parts: [{ text }],
				});
				if (size === 0) {
					expect(preview).toBe("no text content");
				} else if (size > 80) {
					expect(preview).toBe(`${"p".repeat(80)}...`);
				} else {
					expect(preview).toBe(text);
				}
			});
		}

		it("formatFunctionCalls args dataSize ellipsis at >50 JSON chars", () => {
			const short = { x: "a".repeat(10) };
			const exact = { x: "a".repeat(42) };
			const over = { x: "a".repeat(43) };
			expect(JSON.stringify(exact).length).toBe(50);
			expect(JSON.stringify(over).length).toBeGreaterThan(50);

			expect(
				LogFormatter.formatFunctionCalls([
					{ functionCall: { name: "s", args: short } as any },
				]),
			).not.toContain("...");
			expect(
				LogFormatter.formatFunctionCalls([
					{ functionCall: { name: "e", args: exact } as any },
				]),
			).not.toContain("...");
			expect(
				LogFormatter.formatFunctionCalls([
					{ functionCall: { name: "o", args: over } as any },
				]),
			).toContain("...");
		});
	});

	describe("mixed part type index matrix", () => {
		it("formats heterogeneous parts with stable indices", () => {
			const parts: Part[] = [
				{ text: "hi" },
				{ fileData: { mimeType: "text/csv", fileUri: "gs://f" } as any },
				{
					executableCode: { code: "print(1)", language: "PYTHON" as any },
				},
				{
					codeExecutionResult: {
						outcome: "OUTCOME_OK" as any,
						output: "1",
					},
				},
				{} as Part,
			];
			const lines = LogFormatter.formatContentParts({
				role: "model",
				parts,
			});
			expect(lines).toHaveLength(5);
			expect(lines[0]).toMatch(/^\[0\] text:/);
			expect(lines[1]).toContain("file: text/csv");
			expect(lines[2]).toContain("executable_code:");
			expect(lines[3]).toContain("execution result: OUTCOME_OK");
			expect(lines[4]).toContain("unknown: unknown content");
		});
	});
});
