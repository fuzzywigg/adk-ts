import { type Content, Language, Outcome } from "@google/genai";
import { describe, expect, it } from "vitest";
import { CodeExecutionUtils } from "../../code-executors/code-execution-utils";

/**
 * Tenth leftover: executableCode empty-string still extracts; falsy next
 * codeExecutionResult does not skip; convert prefers executableCode when both
 * present; suffix after a fence is dropped.
 */
describe("CodeExecutionUtils empty executable / suffix-drop tenth leftover", () => {
	it("trailing executableCode with empty code still extracts (object is truthy)", () => {
		const content: Content = {
			parts: [
				{
					executableCode: { code: "", language: Language.PYTHON },
				},
			],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBe("");
		expect(content.parts).toHaveLength(1);
	});

	it.each([
		undefined,
		null,
		0,
		"",
		false,
	] as const)("next-part codeExecutionResult=%j is falsy so executableCode still extracts", (result) => {
		const content: Content = {
			parts: [
				{
					executableCode: { code: "print(1)", language: Language.PYTHON },
				},
				{ codeExecutionResult: result as any },
			],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBe("print(1)");
		expect(content.parts).toHaveLength(1);
	});

	it("next-part empty codeExecutionResult object is truthy so extract skips to fences", () => {
		const content: Content = {
			parts: [
				{
					executableCode: { code: "print(1)", language: Language.PYTHON },
				},
				{
					codeExecutionResult: {},
				},
				{ text: "```\nprint(2)\n```" },
			],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```\n", "\n```"],
			]),
		).toBe("print(2)");
	});

	it("convert prefers trailing executableCode even when codeExecutionResult is also set", () => {
		const content: Content = {
			role: "model",
			parts: [
				{
					executableCode: { code: "x=1", language: Language.PYTHON },
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "ignored",
					},
				} as any,
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["<<CODE>>", "<</CODE>>"],
			["<<OUT>>", "<</OUT>>"],
		);
		expect(content.parts?.[0]).toEqual({ text: "<<CODE>>x=1<</CODE>>" });
		expect(content.role).toBe("model");
	});

	it("fenced suffix after the first block is dropped (not reattached)", () => {
		const content: Content = {
			parts: [{ text: "pre```\nprint(3)\n```TRAILING should vanish" }],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```\n", "\n```"],
			]),
		).toBe("print(3)");
		expect(content.parts?.map((p) => p.text).filter(Boolean)).toEqual(["pre"]);
		expect(JSON.stringify(content.parts)).not.toContain("TRAILING");
	});

	it("prefix '0' is truthy so it is kept as a text part", () => {
		const content: Content = {
			parts: [{ text: "0```\nprint(4)\n```" }],
		};
		CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["```\n", "\n```"],
		]);
		expect(content.parts?.[0]).toEqual({ text: "0" });
		expect(content.parts?.[1]?.executableCode?.code).toBe("print(4)");
	});
});
