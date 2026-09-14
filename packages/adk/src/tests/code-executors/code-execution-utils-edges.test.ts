import { type Content, Language, Outcome } from "@google/genai";
import { describe, expect, it } from "vitest";
import { CodeExecutionUtils } from "../../code-executors/code-execution-utils";

describe("CodeExecutionUtils edges", () => {
	describe("extractCodeAndTruncateContent early returns", () => {
		it.each([
			{ label: "undefined content", content: undefined as any },
			{ label: "null content", content: null as any },
			{ label: "missing parts", content: {} as Content },
			{ label: "empty parts array", content: { parts: [] } as Content },
		])("returns null for $label (!content?.parts?.length)", ({ content }) => {
			expect(
				CodeExecutionUtils.extractCodeAndTruncateContent(content, [
					["```", "```"],
				]),
			).toBeNull();
		});

		it("returns null when no text parts exist", () => {
			expect(
				CodeExecutionUtils.extractCodeAndTruncateContent(
					{ parts: [{ inlineData: { data: "x", mimeType: "text/plain" } }] },
					[["```", "```"]],
				),
			).toBeNull();
		});

		it("returns null when fenced match has empty code group (!code)", () => {
			expect(
				CodeExecutionUtils.extractCodeAndTruncateContent(
					{ parts: [{ text: "``````" }] },
					[["```", "```"]],
				),
			).toBeNull();
		});

		it("extracts newline-only fenced body because !code only guards empty string", () => {
			expect(
				CodeExecutionUtils.extractCodeAndTruncateContent(
					{ parts: [{ text: "```\n```" }] },
					[["```", "```"]],
				),
			).toBe("\n");
		});

		it("returns null when delimiter pattern matches but code group is empty", () => {
			expect(
				CodeExecutionUtils.extractCodeAndTruncateContent(
					{ parts: [{ text: "``````" }] },
					[["```", "```"]],
				),
			).toBeNull();
		});

		it("returns null when no delimiter matches", () => {
			expect(
				CodeExecutionUtils.extractCodeAndTruncateContent(
					{ parts: [{ text: "plain prose without fences" }] },
					[["<<<", ">>>"]],
				),
			).toBeNull();
		});
	});

	describe("buildCodeExecutionResultPart stdout || !outputFiles.length", () => {
		it("includes stdout banner when stdout is non-empty even with output files", () => {
			const part = CodeExecutionUtils.buildCodeExecutionResultPart({
				stdout: "ok",
				stderr: "",
				outputFiles: [
					{ name: "out.csv", content: "YQ==", mimeType: "text/csv" },
				],
			});
			expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
			expect(part.codeExecutionResult?.output).toContain(
				"Code execution result",
			);
			expect(part.codeExecutionResult?.output).toContain("`out.csv`");
		});

		it("includes stdout banner when stdout empty but no output files", () => {
			const part = CodeExecutionUtils.buildCodeExecutionResultPart({
				stdout: "",
				stderr: "",
				outputFiles: [],
			});
			expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
			expect(part.codeExecutionResult?.output).toContain(
				"Code execution result",
			);
			expect(part.codeExecutionResult?.output).not.toContain("Saved artifacts");
		});

		it("omits stdout banner when stdout empty but output files exist", () => {
			const part = CodeExecutionUtils.buildCodeExecutionResultPart({
				stdout: "",
				stderr: "",
				outputFiles: [
					{
						name: "out.bin",
						content: "YQ==",
						mimeType: "application/octet-stream",
					},
				],
			});
			expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
			expect(part.codeExecutionResult?.output).not.toContain(
				"Code execution result",
			);
			expect(part.codeExecutionResult?.output).toContain("`out.bin`");
		});

		it("prefers stderr failure path over stdout/files", () => {
			const part = CodeExecutionUtils.buildCodeExecutionResultPart({
				stdout: "partial",
				stderr: "TypeError: boom",
				outputFiles: [
					{ name: "out.txt", content: "eA==", mimeType: "text/plain" },
				],
			});
			expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_FAILED);
			expect(part.codeExecutionResult?.output).toBe("TypeError: boom");
		});
	});

	describe("convertCodeExecutionParts early returns", () => {
		it("no-ops when parts is undefined", () => {
			const content: Content = {};
			expect(
				CodeExecutionUtils.convertCodeExecutionParts(
					content,
					["```", "```"],
					["<", ">"],
				),
			).toBeUndefined();
			expect(content.parts).toBeUndefined();
		});

		it("no-ops when parts is an empty array", () => {
			const content: Content = { role: "model", parts: [] };
			CodeExecutionUtils.convertCodeExecutionParts(
				content,
				["```", "```"],
				["<", ">"],
			);
			expect(content.parts).toEqual([]);
		});

		it("no-ops on multi-part trailing codeExecutionResult", () => {
			const multi: Content = {
				parts: [
					{ text: "keep" },
					{
						codeExecutionResult: {
							outcome: Outcome.OUTCOME_OK,
							output: "x",
						},
					},
				],
			};
			CodeExecutionUtils.convertCodeExecutionParts(
				multi,
				["```", "```"],
				["<", ">"],
			);
			expect(multi.parts?.[1]?.codeExecutionResult?.output).toBe("x");
			expect(multi.role).toBeUndefined();
		});

		it("converts trailing executableCode on multi-part content", () => {
			const content: Content = {
				parts: [
					{ text: "keep" },
					{ executableCode: { code: "z=9", language: Language.PYTHON } },
				],
			};
			CodeExecutionUtils.convertCodeExecutionParts(
				content,
				["```py\n", "\n```"],
				["<", ">"],
			);
			expect(content.parts?.[1]?.text).toBe("```py\nz=9\n```");
			expect(content.parts?.[0]?.text).toBe("keep");
		});

		it("converts single trailing result and sets role user", () => {
			const content: Content = {
				role: "model",
				parts: [
					{
						codeExecutionResult: {
							outcome: Outcome.OUTCOME_OK,
							output: "done",
						},
					},
				],
			};
			CodeExecutionUtils.convertCodeExecutionParts(
				content,
				["```", "```"],
				["<<", ">>"],
			);
			expect(content.parts?.[0]?.text).toBe("<<done>>");
			expect(content.role).toBe("user");
		});
	});

	describe("getEncodedFileContent edge cases", () => {
		it("encodes empty string and empty ArrayBuffer", () => {
			expect(CodeExecutionUtils.getEncodedFileContent("")).toBe("");
			expect(CodeExecutionUtils.getEncodedFileContent(new ArrayBuffer(0))).toBe(
				"",
			);
		});

		it("round-trips already-base64 content", () => {
			const payload = btoa("payload-bytes");
			expect(CodeExecutionUtils.getEncodedFileContent(payload)).toBe(payload);
		});
	});
});
