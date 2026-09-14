import { describe, expect, it } from "vitest";
import { Outcome } from "@google/genai";
import { CodeExecutionUtils } from "../../code-executors/code-execution-utils";

describe("CodeExecutionUtils stderr truthy asymmetry fifth leftover", () => {
	it.each([
		{ label: "empty-string", stderr: "", failed: false },
		{ label: "null", stderr: null as any, failed: false },
		{ label: "undefined", stderr: undefined as any, failed: false },
		{ label: "false", stderr: false as any, failed: false },
		{ label: "0 number", stderr: 0 as any, failed: false },
		{ label: "string 0", stderr: "0", failed: true },
		{ label: "whitespace", stderr: " ", failed: true },
		{ label: "newline", stderr: "\n", failed: true },
		{ label: "false string", stderr: "false", failed: true },
		{ label: "error text", stderr: "boom", failed: true },
	])("stderr $label → failed=$failed via truthy if", ({ stderr, failed }) => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "out",
			stderr,
			outputFiles: [],
		});
		if (failed) {
			expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_FAILED);
			expect(part.codeExecutionResult?.output).toBe(stderr);
		} else {
			expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
			expect(part.codeExecutionResult?.output).toContain(
				"Code execution result",
			);
			expect(part.codeExecutionResult?.output).toContain("out");
		}
	});

	it("stdout '0' is truthy and forces banner even with outputFiles", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "0",
			stderr: "",
			outputFiles: [{ name: "a.csv", content: "YQ==", mimeType: "text/csv" }],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
		expect(part.codeExecutionResult?.output).toContain("Code execution result");
		expect(part.codeExecutionResult?.output).toContain("0");
		expect(part.codeExecutionResult?.output).toContain("`a.csv`");
	});

	it("stdout empty + files omits banner (|| asymmetry with '0')", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "",
			stderr: "",
			outputFiles: [{ name: "a.csv", content: "YQ==", mimeType: "text/csv" }],
		});
		expect(part.codeExecutionResult?.output).not.toContain(
			"Code execution result",
		);
		expect(part.codeExecutionResult?.output).toContain("Saved artifacts");
	});

	it("extractCodeAndTruncateContent returns null for empty matched code group", () => {
		const content = {
			role: "model",
			parts: [{ text: "prefix`python\n\n`suffix" }],
		} as any;
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["`python\n", "\n`"],
		]);
		expect(code).toBeNull();
	});

	it("extractCodeAndTruncateContent skips falsy prefix part push", () => {
		const content = {
			role: "model",
			parts: [{ text: "`python\nprint(1)\n`" }],
		} as any;
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["`python\n", "\n`"],
		]);
		expect(code).toBe("print(1)");
		expect(content.parts).toHaveLength(1);
		expect(content.parts[0].executableCode?.code).toBe("print(1)");
	});
});
