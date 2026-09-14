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

	it("skips executableCode followed by codeExecutionResult and falls through to text", () => {
		const content: Content = {
			parts: [
				{ executableCode: { code: "skip-me", language: Language.PYTHON } },
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "already ran",
					},
				},
				{ text: "prefix\n```python\nprint(9)\n```\n" },
			],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["```python", "```"],
		]);
		expect(code).toBe("\nprint(9)\n");
		expect(content.parts?.some((p) => p.executableCode)).toBe(true);
	});

	it("returns null for empty content, empty match groups, and missing text parts", () => {
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(undefined as any, [
				["```", "```"],
			]),
		).toBeNull();
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(
				{ parts: [{ inlineData: { data: "x", mimeType: "text/plain" } }] },
				[["```", "```"]],
			),
		).toBeNull();
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(
				{ parts: [{ text: "``````" }] },
				[["```", "```"]],
			),
		).toBeNull();
	});

	it("escapes regex-special delimiters and keeps prefix-only rewrite", () => {
		const content: Content = {
			parts: [{ text: "intro [[code]] body [[/code]]" }],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["[[code]]", "[[/code]]"],
		]);
		expect(code).toBe(" body ");
		expect(content.parts?.[0]?.text).toBe("intro ");
		expect(content.parts?.[1]?.executableCode?.code).toBe(" body ");
	});

	it("builds ok result with only output files and no stdout banner when stdout empty", () => {
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

	it("convertCodeExecutionParts no-ops on empty parts and multi-part trailing results", () => {
		const empty: Content = { parts: [] };
		expect(
			CodeExecutionUtils.convertCodeExecutionParts(
				empty,
				["```", "```"],
				["<", ">"],
			),
		).toBeUndefined();

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

	it("encodes invalid base64-looking strings via btoa", () => {
		const weird = "not!!base64";
		expect(CodeExecutionUtils.getEncodedFileContent(weird)).toBe(btoa(weird));
	});

	it("extracts last executableCode when it is the final part", () => {
		const content: Content = {
			parts: [
				{ text: "intro" },
				{ executableCode: { code: "print(1)", language: Language.PYTHON } },
			],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBe("print(1)");
		expect(content.parts).toHaveLength(2);
	});

	it("supports multiple delimiter pairs and picks the first match", () => {
		const content: Content = {
			parts: [{ text: "before <py>x=1</py> after ```y=2```" }],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["<py>", "</py>"],
			["```", "```"],
		]);
		expect(code).toBe("x=1");
		expect(content.parts?.[0]?.text).toBe("before ");
	});

	it("omits prefix part when fenced code starts at the beginning", () => {
		const content: Content = {
			parts: [{ text: "```\nprint(0)\n```\ntrailing" }],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["```", "```"],
		]);
		expect(code).toBe("\nprint(0)\n");
		expect(content.parts?.[0]?.executableCode?.code).toBe("\nprint(0)\n");
		expect(content.parts).toHaveLength(1);
	});

	it("builds ok result with stdout only and no artifacts", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "42\n",
			stderr: "",
			outputFiles: [],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
		expect(part.codeExecutionResult?.output).toContain("42");
		expect(part.codeExecutionResult?.output).not.toContain("Saved artifacts");
	});

	it("lists multiple saved artifacts comma-joined with backticks", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "ok",
			stderr: "",
			outputFiles: [
				{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
				{ name: "b.png", content: "Yg==", mimeType: "image/png" },
			],
		});
		expect(part.codeExecutionResult?.output).toContain("`a.csv`,`b.png`");
	});

	it("prefers stderr failure over stdout when both are present", () => {
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

	it("convertCodeExecutionParts sets role user for single result part", () => {
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

	it("convertCodeExecutionParts no-ops when parts is undefined", () => {
		const content: Content = {};
		expect(
			CodeExecutionUtils.convertCodeExecutionParts(
				content,
				["```", "```"],
				["<", ">"],
			),
		).toBeUndefined();
	});

	it("joins multiple text parts before fence matching", () => {
		const content: Content = {
			parts: [
				{ text: "line1\n" },
				{ text: "```python\n" },
				{ text: "print('hi')\n```\n" },
			],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["```python", "```"],
		]);
		expect(code).toBe("\n\nprint('hi')\n");
	});

	it("encodes empty string and empty ArrayBuffer as empty base64", () => {
		expect(CodeExecutionUtils.getEncodedFileContent("")).toBe("");
		const empty = new ArrayBuffer(0);
		expect(CodeExecutionUtils.getEncodedFileContent(empty)).toBe("");
	});

	it("round-trips already-base64 content without double encoding", () => {
		const payload = btoa("payload-bytes");
		expect(CodeExecutionUtils.getEncodedFileContent(payload)).toBe(payload);
		expect(CodeExecutionUtils.getEncodedFileContent(btoa(payload))).toBe(
			btoa(payload),
		);
	});

	it.each([
		{ start: "[[[", end: "]]]", body: "a=1" },
		{ start: "$$", end: "$$", body: "b=2" },
		{ start: "{{", end: "}}", body: "c=3" },
	])("escapes delimiter $start/$end for fence extraction", ({
		start,
		end,
		body,
	}) => {
		const content: Content = {
			parts: [{ text: `pre ${start}${body}${end} post` }],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			[start, end],
		]);
		expect(code).toBe(body);
	});

	it("skips non-text trailing parts when converting executable code", () => {
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

	it("returns null when only associated executableCode+result pairs exist", () => {
		const content: Content = {
			parts: [
				{ executableCode: { code: "done", language: Language.PYTHON } },
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "ok",
					},
				},
			],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBeNull();
	});

	it("buildExecutableCodePart always sets PYTHON language", () => {
		const part = CodeExecutionUtils.buildExecutableCodePart("");
		expect(part.executableCode?.language).toBe(Language.PYTHON);
		expect(part.executableCode?.code).toBe("");
	});
});

describe("CodeExecutionUtils leftover edges", () => {
	it("extractCodeAndTruncateContent returns null when no delimiter matches", () => {
		const content: Content = {
			parts: [{ text: "plain prose without fences" }],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["<<<", ">>>"],
			]),
		).toBeNull();
	});

	it("buildCodeExecutionResultPart prefers stderr when stdout is empty", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "",
			stderr: "traceback",
			outputFiles: [],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_FAILED);
		expect(part.codeExecutionResult?.output).toBe("traceback");
	});

	it("convertCodeExecutionParts no-ops when parts is an empty array", () => {
		const content: Content = { role: "model", parts: [] };
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```", "```"],
			["<", ">"],
		);
		expect(content.parts).toEqual([]);
	});

	it("getEncodedFileContent encodes Uint8Array bytes", () => {
		const bytes = new TextEncoder().encode("bytes");
		expect(CodeExecutionUtils.getEncodedFileContent(bytes.buffer)).toBe(
			btoa("bytes"),
		);
	});

	it("buildCodeExecutionResultPart includes stdout when stderr is also present", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "printed",
			stderr: "warn",
			outputFiles: [],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_FAILED);
		expect(part.codeExecutionResult?.output).toContain("warn");
	});

	it("buildCodeExecutionResultPart succeeds with stdout only", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "hello",
			stderr: "",
			outputFiles: [],
		});
		expect(part.codeExecutionResult?.outcome).toBe(Outcome.OUTCOME_OK);
		expect(part.codeExecutionResult?.output).toContain("hello");
		expect(part.codeExecutionResult?.output).toContain("Code execution result");
	});

	it("getEncodedFileContent round-trips plain strings", () => {
		expect(CodeExecutionUtils.getEncodedFileContent("abc")).toBe(btoa("abc"));
	});
});
