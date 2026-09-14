import { type Content, Language, Outcome } from "@google/genai";
import { describe, expect, it } from "vitest";
import { CodeExecutionUtils } from "../../code-executors/code-execution-utils";

describe("CodeExecutionUtils fourth leftover coalesce / early-return matrices", () => {
	const earlyReturnContents: Array<{ label: string; content: any }> = [
		{ label: "undefined", content: undefined },
		{ label: "null", content: null },
		{ label: "empty object", content: {} },
		{ label: "parts undefined", content: { parts: undefined } },
		{ label: "parts empty", content: { parts: [] } },
		{ label: "parts null", content: { parts: null } },
	];

	for (const { label, content } of earlyReturnContents) {
		it(`extractCodeAndTruncateContent early null for ${label}`, () => {
			expect(
				CodeExecutionUtils.extractCodeAndTruncateContent(content, [
					["```", "```"],
				]),
			).toBeNull();
		});
	}

	const nonTextOnlyParts: Content[] = [
		{ parts: [{ inlineData: { data: "x", mimeType: "text/plain" } }] },
		{ parts: [{ functionCall: { name: "f", args: {} } } as any] },
		{
			parts: [
				{ inlineData: { data: "a", mimeType: "a" } },
				{ inlineData: { data: "b", mimeType: "b" } },
			],
		},
	];

	for (const [i, content] of nonTextOnlyParts.entries()) {
		it(`extract returns null when no text parts #${i}`, () => {
			expect(
				CodeExecutionUtils.extractCodeAndTruncateContent(content, [
					["```", "```"],
				]),
			).toBeNull();
		});
	}

	const fenceCombos: Array<{
		delims: Array<[string, string]>;
		text: string;
		expected: string | null;
	}> = [
		{
			delims: [["```", "```"]],
			text: "```\nprint(0)\n```",
			expected: "\nprint(0)\n",
		},
		{
			delims: [["```python\n", "\n```"]],
			text: "```python\nx=1\n```",
			expected: "x=1",
		},
		{
			delims: [["`tool_code\n", "\n`"]],
			text: "`tool_code\ny=2\n`",
			expected: "y=2",
		},
		{
			delims: [["<<<", ">>>"]],
			text: "pre<<<body>>>post",
			expected: "body",
		},
		{
			delims: [
				["```", "```"],
				["<<<", ">>>"],
			],
			text: "<<<alt>>>",
			expected: "alt",
		},
		{
			delims: [["[[", "]]"]],
			text: "no match here",
			expected: null,
		},
		{
			delims: [["```", "```"]],
			text: "``````",
			expected: null,
		},
		{
			delims: [["```", "```"]],
			text: "```\n```",
			expected: "\n",
		},
	];

	for (const [i, { delims, text, expected }] of fenceCombos.entries()) {
		it(`fence extract matrix #${i}`, () => {
			const content: Content = { parts: [{ text }] };
			expect(
				CodeExecutionUtils.extractCodeAndTruncateContent(content, delims),
			).toBe(expected);
		});
	}

	it("skips executableCode when followed by codeExecutionResult then takes fence", () => {
		const content: Content = {
			parts: [
				{ executableCode: { code: "skip-me", language: Language.PYTHON } },
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "ran",
					},
				},
				{ text: "lead```\ntake\n```trail" },
			],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBe("\ntake\n");
		expect(content.parts?.[0]?.text).toBe("lead");
		expect(content.parts?.[1]?.executableCode?.code).toBe("\ntake\n");
	});

	it("takes last-index executableCode without following result", () => {
		const content: Content = {
			parts: [
				{ text: "noise" },
				{ executableCode: { code: "keep", language: Language.PYTHON } },
			],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBe("keep");
		expect(content.parts).toHaveLength(2);
	});

	it("truncates trailing parts after bare executableCode", () => {
		const content: Content = {
			parts: [
				{ executableCode: { code: "only", language: Language.PYTHON } },
				{ text: "drop-1" },
				{ text: "drop-2" },
			],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBe("only");
		expect(content.parts).toHaveLength(1);
	});

	const codes = ["", " ", "x", "print('hi')", "a\nb", "\t"];
	for (const code of codes) {
		it(`buildExecutableCodePart preserves ${JSON.stringify(code)}`, () => {
			const part = CodeExecutionUtils.buildExecutableCodePart(code);
			expect(part.executableCode?.code).toBe(code);
			expect(part.executableCode?.language).toBe(Language.PYTHON);
		});
	}

	const resultMatrix = [
		{
			label: "stderr truthy wins",
			input: {
				stdout: "out",
				stderr: "e",
				outputFiles: [] as any[],
			},
			outcome: Outcome.OUTCOME_FAILED,
			exact: "e",
		},
		{
			label: "stderr whitespace still fails",
			input: {
				stdout: "out",
				stderr: " ",
				outputFiles: [] as any[],
			},
			outcome: Outcome.OUTCOME_FAILED,
			exact: " ",
		},
		{
			label: "stdout banner empty files",
			input: { stdout: "", stderr: "", outputFiles: [] as any[] },
			outcome: Outcome.OUTCOME_OK,
			contains: ["Code execution result"],
			notContains: ["Saved artifacts"],
		},
		{
			label: "files only omits banner",
			input: {
				stdout: "",
				stderr: "",
				outputFiles: [{ name: "a.csv", content: "YQ==", mimeType: "text/csv" }],
			},
			outcome: Outcome.OUTCOME_OK,
			contains: ["Saved artifacts", "`a.csv`"],
			notContains: ["Code execution result"],
		},
		{
			label: "stdout and files both",
			input: {
				stdout: "done",
				stderr: "",
				outputFiles: [
					{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
					{ name: "b.png", content: "Yg==", mimeType: "image/png" },
				],
			},
			outcome: Outcome.OUTCOME_OK,
			contains: ["Code execution result", "done", "`a.csv`", "`b.png`"],
		},
		{
			label: "stdout only",
			input: {
				stdout: "hello",
				stderr: "",
				outputFiles: [] as any[],
			},
			outcome: Outcome.OUTCOME_OK,
			contains: ["hello"],
			notContains: ["Saved artifacts"],
		},
	];

	for (const row of resultMatrix) {
		it(`buildCodeExecutionResultPart ${row.label}`, () => {
			const part = CodeExecutionUtils.buildCodeExecutionResultPart(row.input);
			expect(part.codeExecutionResult?.outcome).toBe(row.outcome);
			if ("exact" in row && row.exact !== undefined) {
				expect(part.codeExecutionResult?.output).toBe(row.exact);
			}
			for (const s of row.contains ?? []) {
				expect(part.codeExecutionResult?.output).toContain(s);
			}
			for (const s of row.notContains ?? []) {
				expect(part.codeExecutionResult?.output).not.toContain(s);
			}
		});
	}

	const convertEarly: Content[] = [
		{},
		{ parts: [] },
		{ parts: undefined as any },
		{ role: "model", parts: [] },
	];

	for (const [i, content] of convertEarly.entries()) {
		it(`convertCodeExecutionParts early no-op #${i}`, () => {
			const before = structuredClone(content);
			CodeExecutionUtils.convertCodeExecutionParts(
				content,
				["```", "```"],
				["<", ">"],
			);
			expect(content).toEqual(before);
		});
	}

	const codeBlockDelims: Array<[string, string]> = [
		["```", "```"],
		["`", "`"],
		["[[", "]]"],
		["BEGIN\n", "\nEND"],
	];

	for (const [i, delim] of codeBlockDelims.entries()) {
		it(`convert trailing executableCode with delim #${i}`, () => {
			const content: Content = {
				parts: [
					{ text: "keep" },
					{ executableCode: { code: "z=1", language: Language.PYTHON } },
				],
			};
			CodeExecutionUtils.convertCodeExecutionParts(content, delim, ["<", ">"]);
			expect(content.parts?.[0]?.text).toBe("keep");
			expect(content.parts?.[1]?.text).toBe(`${delim[0]}z=1${delim[1]}`);
		});
	}

	it("convert single trailing result sets role user", () => {
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
			["```", "```"],
			["<<", ">>"],
		);
		expect(content.parts?.[0]?.text).toBe("<<ok>>");
		expect(content.role).toBe("user");
	});

	it("convert multi-part trailing result is skipped", () => {
		const content: Content = {
			parts: [
				{ text: "lead" },
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_FAILED,
						output: "err",
					},
				},
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```", "```"],
			["<", ">"],
		);
		expect(content.parts?.[1]?.codeExecutionResult?.output).toBe("err");
	});

	it("convert non-trailing executableCode left alone", () => {
		const content: Content = {
			parts: [
				{ executableCode: { code: "a=1", language: Language.PYTHON } },
				{ text: "after" },
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```", "```"],
			["<", ">"],
		);
		expect(content.parts?.[0]?.executableCode?.code).toBe("a=1");
	});

	const encodeInputs: Array<{ label: string; data: string | ArrayBuffer }> = [
		{ label: "plain", data: "hello" },
		{ label: "empty", data: "" },
		{ label: "unicode", data: "café" },
		{ label: "already-b64", data: btoa("payload") },
		{ label: "buffer", data: new TextEncoder().encode("buf").buffer },
		{ label: "zeros-buffer", data: new Uint8Array([0, 1, 2]).buffer },
	];

	for (const { label, data } of encodeInputs) {
		it(`getEncodedFileContent ${label}`, () => {
			const encoded = CodeExecutionUtils.getEncodedFileContent(data);
			expect(typeof encoded).toBe("string");
			expect(() => atob(encoded)).not.toThrow();
		});
	}

	it("getEncodedFileContent is idempotent for valid base64", () => {
		const once = CodeExecutionUtils.getEncodedFileContent("abc");
		const twice = CodeExecutionUtils.getEncodedFileContent(once);
		expect(twice).toBe(once);
	});

	it("extract with prefix-only rewrite omits empty prefix part", () => {
		const content: Content = {
			parts: [{ text: "```\ncode\n```" }],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["```", "```"],
		]);
		expect(code).toBe("\ncode\n");
		expect(content.parts?.[0]?.executableCode?.code).toBe("\ncode\n");
	});

	it("joined text parts across newlines participate in fence match", () => {
		const content: Content = {
			parts: [
				{ text: "a" },
				{ text: "```" },
				{ text: "body" },
				{ text: "```" },
			],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["```", "```"],
		]);
		expect(code).toBe("\nbody\n");
	});
});
