import { type Content, Language, Outcome } from "@google/genai";
import { describe, expect, it } from "vitest";
import { CodeExecutionUtils } from "../../code-executors/code-execution-utils";

describe("CodeExecutionUtils", () => {
	it("builds executable code parts as python", () => {
		const part = CodeExecutionUtils.buildExecutableCodePart("print(1)");
		expect(part.executableCode?.code).toBe("print(1)");
		expect(part.executableCode?.language).toBe(Language.PYTHON);
	});

	it("builds failed result parts from stderr", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "",
			stderr: "boom",
			outputFiles: [],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_FAILED);
		expect(part.codeExecutionResult?.output).toBe("boom");
	});

	it("builds ok result parts with stdout and saved artifacts", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "ok",
			stderr: "",
			outputFiles: [{ name: "out.csv", content: "aQ==", mimeType: "text/csv" }],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
		expect(part.codeExecutionResult?.output).toContain("Code execution result");
		expect(part.codeExecutionResult?.output).toContain("`out.csv`");
	});

	it("extracts code from executableCode parts and truncates trailing content", () => {
		const content: Content = {
			parts: [
				{ executableCode: { code: "x = 1", language: Language.PYTHON } },
				{ text: "trailing" },
			],
		};

		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["```", "```"],
		]);
		expect(code).toBe("x = 1");
		expect(content.parts).toHaveLength(1);
	});

	it("extracts fenced code from text and rewrites parts", () => {
		const content: Content = {
			parts: [{ text: "prefix\n```\nprint(2)\n```\nsuffix" }],
		};

		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["```", "```"],
		]);
		expect(code).toBe("\nprint(2)\n");
		expect(content.parts?.[0]?.text).toBe("prefix\n");
		expect(content.parts?.[1]?.executableCode?.code).toBe("\nprint(2)\n");
	});

	it("converts trailing executable code and result parts to text", () => {
		const withCode: Content = {
			parts: [{ executableCode: { code: "a=1", language: Language.PYTHON } }],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			withCode,
			["```", "```"],
			["<result>", "</result>"],
		);
		expect(withCode.parts?.[0]?.text).toBe("```a=1```");

		const withResult: Content = {
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
			withResult,
			["```", "```"],
			["<result>", "</result>"],
		);
		expect(withResult.parts?.[0]?.text).toBe("<result>done</result>");
	});

	it("encodes file content from strings and ArrayBuffers", () => {
		expect(CodeExecutionUtils.getEncodedFileContent("hello")).toBe(
			btoa("hello"),
		);
		const already = btoa("already");
		expect(CodeExecutionUtils.getEncodedFileContent(already)).toBe(already);

		const buffer = new TextEncoder().encode("buf").buffer;
		expect(CodeExecutionUtils.getEncodedFileContent(buffer)).toBe(btoa("buf"));
	});

	it("returns null when content has no extractable code", () => {
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(
				{ parts: [{ text: "no fences here" }] },
				[["```", "```"]],
			),
		).toBeNull();
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent({ parts: [] }, [
				["```", "```"],
			]),
		).toBeNull();
		expect(
			CodeExecutionUtils.convertCodeExecutionParts(
				{ parts: [{ text: "leave me" }] },
				["```", "```"],
				["<", ">"],
			),
		).toBeUndefined();
	});
});
