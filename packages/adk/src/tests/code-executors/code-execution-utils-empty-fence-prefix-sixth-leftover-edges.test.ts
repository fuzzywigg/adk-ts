import { type Content, Outcome } from "@google/genai";
import { describe, expect, it } from "vitest";
import { CodeExecutionUtils } from "../../code-executors/code-execution-utils";

/**
 * Leftover distinct from #168 stderr asymmetry: extract fence empty-code null,
 * falsy prefix skip, truthy "0"/space code kept, and convert multipart skip.
 */
describe("CodeExecutionUtils sixth leftover: empty fence / falsy prefix", () => {
	const delims: Array<[string, string]> = [["```\n", "\n```"]];

	it("empty fenced body returns null and leaves parts untouched", () => {
		const content: Content = {
			parts: [{ text: "before```\n\n```after" }],
		};
		const original = [...content.parts!];
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, delims),
		).toBeNull();
		expect(content.parts).toEqual(original);
	});

	it("code '0' is truthy and extracted", () => {
		const content: Content = {
			parts: [{ text: "```\n0\n```" }],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, delims),
		).toBe("0");
		expect(content.parts?.some((p) => p.executableCode?.code === "0")).toBe(
			true,
		);
	});

	it("falsy empty prefix is omitted from rebuilt parts", () => {
		const content: Content = {
			parts: [{ text: "```\nprint(1)\n```" }],
		};
		CodeExecutionUtils.extractCodeAndTruncateContent(content, delims);
		expect(content.parts).toHaveLength(1);
		expect(content.parts?.[0].executableCode?.code).toBe("print(1)");
	});

	it("non-empty prefix is preserved as text part", () => {
		const content: Content = {
			parts: [{ text: "intro\n```\nprint(1)\n```" }],
		};
		CodeExecutionUtils.extractCodeAndTruncateContent(content, delims);
		expect(content.parts?.[0]).toEqual({ text: "intro\n" });
		expect(content.parts?.[1].executableCode?.code).toBe("print(1)");
	});

	it("whitespace-only code body is kept (!code only guards '')", () => {
		const content: Content = {
			parts: [{ text: "```\n \n```" }],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, delims),
		).toBe(" ");
	});
});

describe("CodeExecutionUtils sixth leftover: convert multipart / result banners", () => {
	it("convert skips when multiple parts even if last is result", () => {
		const content: Content = {
			role: "model",
			parts: [
				{ text: "keep" },
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "out",
					},
				},
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```\n", "\n```"],
			["<<", ">>"],
		);
		expect(content.parts?.[1].codeExecutionResult?.output).toBe("out");
		expect(content.role).toBe("model");
	});

	it("single result part converts and flips role to user", () => {
		const content: Content = {
			role: "model",
			parts: [
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "ok",
					},
				},
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```\n", "\n```"],
			["<<", ">>"],
		);
		expect(content.parts?.[0]).toEqual({ text: "<<ok>>" });
		expect(content.role).toBe("user");
	});

	it("stdout '0' still emits Code execution result banner", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "0",
			stderr: "",
			outputFiles: [],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
		expect(part.codeExecutionResult?.output).toContain(
			"Code execution result:\n0\n",
		);
	});

	it("empty stdout with outputFiles skips banner and lists files", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "",
			stderr: "",
			outputFiles: [{ name: "a.csv", content: "x", mimeType: "text/csv" }],
		});
		expect(part.codeExecutionResult?.output).toBe("Saved artifacts:\n`a.csv`");
		expect(part.codeExecutionResult?.output).not.toContain(
			"Code execution result",
		);
	});

	it("getEncodedFileContent re-encodes non-base64 unicode", () => {
		const encoded = CodeExecutionUtils.getEncodedFileContent("café");
		expect(encoded).toBe(btoa("café"));
		expect(CodeExecutionUtils.getEncodedFileContent(encoded)).toBe(encoded);
	});

	it("ArrayBuffer path encodes decoded bytes", () => {
		const buf = new TextEncoder().encode("abc").buffer;
		expect(CodeExecutionUtils.getEncodedFileContent(buf)).toBe(btoa("abc"));
	});
});
