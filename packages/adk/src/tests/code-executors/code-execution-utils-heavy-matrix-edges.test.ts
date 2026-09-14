import { type Content, Language, Outcome } from "@google/genai";
import { describe, expect, it } from "vitest";
import { CodeExecutionUtils } from "../../code-executors/code-execution-utils";

describe("CodeExecutionUtils heavy matrix leftover edges", () => {
	it("buildExecutableCodePart always tags language as PYTHON", () => {
		const part = CodeExecutionUtils.buildExecutableCodePart("");
		expect(part.executableCode?.code).toBe("");
		expect(part.executableCode?.language).toBe(Language.PYTHON);
	});

	it("prefers stderr over stdout when both are present for failure outcome", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "ignored",
			stderr: "boom",
			outputFiles: [],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_FAILED);
		expect(part.codeExecutionResult?.output).toBe("boom");
	});

	it("ok outcome includes saved artifact names when present", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "ok",
			stderr: "",
			outputFiles: [
				{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
				{ name: "b.json", content: "e30=", mimeType: "application/json" },
			],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
		expect(part.codeExecutionResult?.output).toContain("`a.csv`");
		expect(part.codeExecutionResult?.output).toContain("`b.json`");
	});

	it("ok outcome with empty stdout and no files still succeeds", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "",
			stderr: "",
			outputFiles: [],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
	});

	it("extractCodeAndTruncateContent returns null without code", () => {
		const content: Content = { parts: [{ text: "no fences here" }] };
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["```", "```"],
		]);
		expect(code).toBeNull();
		expect(content.parts).toHaveLength(1);
	});

	it("extracts executableCode and truncates trailing parts", () => {
		const content: Content = {
			parts: [
				{ executableCode: { code: "x=1", language: Language.PYTHON } },
				{ text: "trail" },
				{ text: "more" },
			],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBe("x=1");
		expect(content.parts).toHaveLength(1);
	});

	it("extracts first fenced block and rewrites surrounding text", () => {
		const content: Content = {
			parts: [{ text: "before\n```\nprint(1)\n```\nafter" }],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["```", "```"],
		]);
		expect(code).toBe("\nprint(1)\n");
		expect(content.parts?.[0]?.text).toBe("before\n");
		expect(content.parts?.[1]?.executableCode?.code).toBe("\nprint(1)\n");
	});

	it("supports alternate fence delimiters", () => {
		const content: Content = {
			parts: [{ text: "<<<\nprint(2)\n>>>" }],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["<<<", ">>>"],
		]);
		expect(code).toBe("\nprint(2)\n");
	});

	it("convertCodeExecutionParts rewrites trailing executable code", () => {
		const content: Content = {
			parts: [
				{ text: "keep" },
				{ executableCode: { code: "a=1", language: Language.PYTHON } },
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```", "```"],
			["<r>", "</r>"],
		);
		expect(content.parts?.[1]?.text).toBe("```a=1```");
	});

	it("convertCodeExecutionParts rewrites trailing result parts", () => {
		const content: Content = {
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
			["<r>", "</r>"],
		);
		expect(content.parts?.[0]?.text).toBe("<r>done</r>");
	});

	it("convertCodeExecutionParts leaves non-trailing code parts alone", () => {
		const content: Content = {
			parts: [
				{ executableCode: { code: "a=1", language: Language.PYTHON } },
				{ text: "after" },
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```", "```"],
			["<r>", "</r>"],
		);
		expect(content.parts?.[0]?.executableCode?.code).toBe("a=1");
		expect(content.parts?.[1]?.text).toBe("after");
	});

	it("getEncodedFileContent is idempotent for already-base64 strings", () => {
		const encoded = btoa("payload");
		expect(CodeExecutionUtils.getEncodedFileContent(encoded)).toBe(encoded);
		expect(CodeExecutionUtils.getEncodedFileContent("plain")).toBe(
			btoa("plain"),
		);
	});

	it("getEncodedFileContent encodes ArrayBuffer views", () => {
		const buffer = new TextEncoder().encode("buf").buffer;
		expect(CodeExecutionUtils.getEncodedFileContent(buffer)).toBe(btoa("buf"));
	});

	it("getEncodedFileContent encodes Uint8Array buffer content", () => {
		const bytes = new TextEncoder().encode("bytes");
		expect(CodeExecutionUtils.getEncodedFileContent(bytes.buffer)).toBe(
			btoa("bytes"),
		);
	});

	it("handles content with empty parts arrays safely", () => {
		const content: Content = { parts: [] };
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBeNull();
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```", "```"],
			["<r>", "</r>"],
		);
		expect(content.parts).toEqual([]);
	});

	it("buildCodeExecutionResultPart with only outputFiles still ok", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "",
			stderr: "",
			outputFiles: [{ name: "only.bin", content: "AA==", mimeType: "bin" }],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
		expect(part.codeExecutionResult?.output).toContain("`only.bin`");
	});

	it("extract prefers executableCode over later fenced text", () => {
		const content: Content = {
			parts: [
				{ executableCode: { code: "first", language: Language.PYTHON } },
				{ text: "```\nsecond\n```" },
			],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBe("first");
		expect(content.parts).toHaveLength(1);
	});

	it("multiline fenced code preserves interior newlines", () => {
		const content: Content = {
			parts: [{ text: "```\nline1\nline2\n```" }],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBe("\nline1\nline2\n");
	});
});
