import { type Content, Language, Outcome } from "@google/genai";
import { describe, expect, it } from "vitest";
import { CodeExecutionUtils } from "../../code-executors/code-execution-utils";

/**
 * Leftover: trailing executableCode conversion; multi-delimiter first-match;
 * stderr truthy already in #168 — here focus on buildExecutableCodePart language
 * and convert when last part is executableCode.
 */
describe("CodeExecutionUtils sixth leftover: convert executable + multi-delim", () => {
	it("convert trailing executableCode into fenced text", () => {
		const content: Content = {
			parts: [
				{
					executableCode: {
						code: "print(42)",
						language: Language.PYTHON,
					},
				},
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```python\n", "\n```"],
			["<<", ">>"],
		);
		expect(content.parts?.[0]).toEqual({
			text: "```python\nprint(42)\n```",
		});
	});

	it("convert no-ops for empty parts", () => {
		const content: Content = { parts: [] };
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```\n", "\n```"],
			["<<", ">>"],
		);
		expect(content.parts).toEqual([]);
	});

	it("convert no-ops when parts missing", () => {
		const content = {} as Content;
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```\n", "\n```"],
			["<<", ">>"],
		);
		expect(content.parts).toBeUndefined();
	});

	it("first matching delimiter pair wins among several", () => {
		const content: Content = {
			parts: [
				{
					text: "pre`python\nx=1\n` mid`tool_code\ny=2\n` end",
				},
			],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["`tool_code\n", "\n`"],
			["`python\n", "\n`"],
		]);
		// leadingDelimiterPattern joins with | — first alternative in regex
		// is tool_code, but python appears first in text; engine picks leftmost.
		expect(code).toBe("x=1");
	});

	it("buildExecutableCodePart always sets Language.PYTHON", () => {
		const part = CodeExecutionUtils.buildExecutableCodePart("x=1");
		expect(part.executableCode?.language).toBe(Language.PYTHON);
		expect(part.executableCode?.code).toBe("x=1");
	});

	it("stderr non-empty short-circuits to FAILED before stdout banner", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "should-ignore",
			stderr: "boom",
			outputFiles: [{ name: "f.txt", content: "x", mimeType: "text/plain" }],
		});
		expect(part.codeExecutionResult).toEqual({
			outcome: Outcome.OUTCOME_FAILED,
			output: "boom",
		});
	});

	it("empty stderr with empty stdout and no files still emits empty banner", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "",
			stderr: "",
			outputFiles: [],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
		expect(part.codeExecutionResult?.output).toBe("Code execution result:\n\n");
	});
});
