import { describe, expect, it } from "vitest";
import { Language, Outcome } from "@google/genai";
import { CodeExecutionUtils } from "../../code-executors/code-execution-utils";

describe("CodeExecutionUtils convert/empty-fence ninth leftover", () => {
	it("convertCodeExecutionParts skips rewrite when multiple parts end with codeExecutionResult", () => {
		const content = {
			role: "model",
			parts: [
				{ text: "preface" },
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "done",
					},
				},
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content as any,
			["```", "```"],
			["<<", ">>"],
		);
		expect(content.parts[1]).toEqual({
			codeExecutionResult: {
				outcome: Outcome.OUTCOME_OK,
				output: "done",
			},
		});
		expect(content.role).toBe("model");
	});

	it("convertCodeExecutionParts rewrites single-part codeExecutionResult and sets role=user", () => {
		const content = {
			role: "model",
			parts: [
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "only",
					},
				},
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content as any,
			["```", "```"],
			["<<", ">>"],
		);
		expect(content.parts[0]).toEqual({ text: "<<only>>" });
		expect(content.role).toBe("user");
	});

	it("convertCodeExecutionParts still rewrites trailing executableCode even with preceding parts", () => {
		const content = {
			role: "model",
			parts: [
				{ text: "note" },
				{
					executableCode: { code: "print(1)", language: Language.PYTHON },
				},
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content as any,
			["<<CODE>>", "<</CODE>>"],
			["<<OUT>>", "<</OUT>>"],
		);
		expect(content.parts[1]).toEqual({
			text: "<<CODE>>print(1)<</CODE>>",
		});
	});

	it('extractCodeAndTruncateContent: "" between fences is falsy → null; whitespace-only code is kept', () => {
		const empty = {
			role: "model",
			parts: [{ text: "before `````` after" }],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(empty as any, [
				["```", "```"],
			]),
		).toBeNull();

		const whitespaceOnly = {
			role: "model",
			parts: [{ text: "before ```  ``` after" }],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(whitespaceOnly as any, [
				["```", "```"],
			]),
		).toBe("  ");
		expect(whitespaceOnly.parts.some((p) => p.executableCode)).toBe(true);
	});

	it("extractCodeAndTruncateContent first matching empty fence group short-circuits to null (skips later pair)", () => {
		const content = {
			role: "model",
			parts: [{ text: "intro `tool_code\n\n` then `python\nprint(2)\n`" }],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(
			content as any,
			[
				["`tool_code\n", "\n`"],
				["`python\n", "\n`"],
			],
		);
		expect(code).toBeNull();
		expect(content.parts).toEqual([
			{ text: "intro `tool_code\n\n` then `python\nprint(2)\n`" },
		]);
	});

	it("buildCodeExecutionResultPart stderr falsy variants fall through to OK path", () => {
		for (const stderr of ["", undefined, null] as const) {
			const part = CodeExecutionUtils.buildCodeExecutionResultPart({
				stdout: "ok",
				stderr: stderr as any,
				outputFiles: [],
			});
			expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
			expect(part.codeExecutionResult?.output).toContain("ok");
		}
	});

	it("getEncodedFileContent re-encodes invalid base64 / whitespace that fails atob roundtrip", () => {
		expect(CodeExecutionUtils.getEncodedFileContent("hello")).toBe(
			btoa("hello"),
		);
		expect(CodeExecutionUtils.getEncodedFileContent("not base64!!!")).toBe(
			btoa("not base64!!!"),
		);
		const valid = btoa("abc");
		expect(CodeExecutionUtils.getEncodedFileContent(valid)).toBe(valid);
	});
});
