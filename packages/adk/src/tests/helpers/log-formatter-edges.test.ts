import type { Content, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

describe("LogFormatter edges", () => {
	describe("mimeType || 'unknown type'", () => {
		it("uses unknown type when fileData.mimeType is missing", () => {
			const content: Content = {
				role: "model",
				parts: [{ fileData: { fileUri: "gs://missing-mime" } as any }],
			};
			const [line] = LogFormatter.formatContentParts(content);
			expect(line).toContain("file: unknown type");
		});

		it("preserves explicit mimeType when present", () => {
			const content: Content = {
				role: "model",
				parts: [
					{ fileData: { mimeType: "text/csv", fileUri: "gs://x" } as any },
				],
			};
			const [line] = LogFormatter.formatContentParts(content);
			expect(line).toContain("file: text/csv");
		});
	});

	describe("code || ''", () => {
		it("renders empty quotes when executableCode.code is missing", () => {
			const content: Content = {
				role: "model",
				parts: [
					{
						executableCode: {
							language: "PYTHON" as any,
						} as any,
					},
				],
			};
			const [line] = LogFormatter.formatContentParts(content);
			expect(line).toContain('executable_code: ""');
		});

		it("truncates long code previews beyond 50 chars", () => {
			const content: Content = {
				role: "model",
				parts: [
					{
						executableCode: {
							code: "c".repeat(60),
							language: "PYTHON" as any,
						},
					},
				],
			};
			const [line] = LogFormatter.formatContentParts(content);
			expect(line).toMatch(/executable_code: "c{50}\.\.\."/);
		});

		it("does not ellipsize code that is exactly 50 characters", () => {
			const code = "d".repeat(50);
			const content: Content = {
				role: "model",
				parts: [
					{
						executableCode: {
							code,
							language: "PYTHON" as any,
						},
					},
				],
			};
			const [line] = LogFormatter.formatContentParts(content);
			expect(line).toBe(`[0] executable_code: "${code}"`);
		});
	});

	describe("outcome || 'unknown' matrix", () => {
		it.each([
			{ outcome: undefined, label: "undefined" },
			{ outcome: null as any, label: "null" },
			{ outcome: "", label: "empty string" },
		])("uses unknown when outcome is $label", ({ outcome }) => {
			const content: Content = {
				role: "model",
				parts: [
					{
						codeExecutionResult: {
							outcome,
							output: "ok",
						} as any,
					},
				],
			};
			const [line] = LogFormatter.formatContentParts(content);
			expect(line).toContain("execution result: unknown");
		});

		it("preserves explicit outcome values", () => {
			const content: Content = {
				role: "model",
				parts: [
					{
						codeExecutionResult: {
							outcome: "OUTCOME_OK" as any,
							output: "1",
						},
					},
				],
			};
			const [line] = LogFormatter.formatContentParts(content);
			expect(line).toContain("execution result: OUTCOME_OK");
		});
	});

	describe("additional formatter fallbacks", () => {
		it("returns unknown content for empty part objects", () => {
			const content: Content = {
				role: "model",
				parts: [{} as Part],
			};
			const [line] = LogFormatter.formatContentParts(content);
			expect(line).toMatch(/unknown: unknown content/);
		});

		it("returns empty string when no parts contain function calls", () => {
			expect(
				LogFormatter.formatFunctionCalls([
					{ text: "only text" },
					{ functionResponse: { name: "x", response: {} } } as Part,
				]),
			).toBe("");
		});

		it("returns no parts for undefined parts array", () => {
			expect(
				LogFormatter.formatContentParts({ role: "user" } as Content),
			).toEqual(["no parts"]);
		});
	});
});
