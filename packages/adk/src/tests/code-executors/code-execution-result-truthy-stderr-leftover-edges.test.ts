import { Outcome } from "@google/genai";
import { describe, expect, it } from "vitest";
import { CodeExecutionUtils } from "../../code-executors/code-execution-utils";

describe("CodeExecutionUtils leftover: truthy non-error stderr strings force OUTCOME_FAILED", () => {
	const truthyNonErrors = [
		"0",
		"false",
		"null",
		"undefined",
		"NaN",
		"[]",
		"{}",
	];

	for (const stderr of truthyNonErrors) {
		it(`stderr=${JSON.stringify(stderr)} is truthy → FAILED with that output`, () => {
			const part = CodeExecutionUtils.buildCodeExecutionResultPart({
				stdout: "ok",
				stderr,
				outputFiles: [],
			});
			expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_FAILED);
			expect(part.codeExecutionResult?.output).toBe(stderr);
		});
	}

	it("empty stderr still allows OUTCOME_OK despite stdout", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "ok",
			stderr: "",
			outputFiles: [],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
		expect(part.codeExecutionResult?.output).toContain("ok");
	});

	it("whitespace-only stderr is still truthy → FAILED", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "ok",
			stderr: " ",
			outputFiles: [],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_FAILED);
		expect(part.codeExecutionResult?.output).toBe(" ");
	});
});
