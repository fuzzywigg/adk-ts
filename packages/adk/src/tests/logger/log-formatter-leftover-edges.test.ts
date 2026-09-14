import type { Content, FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";
import { LlmResponse } from "../../models/llm-response";

describe("LogFormatter leftover null/undefined matrices", () => {
	it("formatFunctionCalls none for empty-like inputs", () => {
		expect(LogFormatter.formatFunctionCalls([])).toBe("none");
		expect(LogFormatter.formatFunctionCalls(null as any)).toBe("none");
		expect(LogFormatter.formatFunctionCalls(undefined as any)).toBe("none");
	});

	it("filters parts without functionCall", () => {
		const parts: Part[] = [
			{ text: "ignore" },
			{ functionCall: { name: "keep", args: {} } as FunctionCall },
			{ functionResponse: { name: "r", response: {} } as any },
		];
		expect(LogFormatter.formatFunctionCalls(parts)).toBe("keep({})");
	});

	const nullishArgs: Array<{ label: string; args: any }> = [
		{ label: "undefined args", args: undefined },
		{ label: "null args treated as truthy object path skipped", args: null },
		{ label: "empty object", args: {} },
		{ label: "nested null", args: { a: null, b: undefined } },
	];

	for (const { label, args } of nullishArgs) {
		it(`formatFunctionCalls args: ${label}`, () => {
			const parts: Part[] = [
				{ functionCall: { name: "fn", args } as FunctionCall },
			];
			if (args === undefined || args === null) {
				expect(LogFormatter.formatFunctionCalls(parts)).toBe("fn({})");
			} else {
				const result = LogFormatter.formatFunctionCalls(parts);
				expect(result.startsWith("fn(")).toBe(true);
				expect(result.endsWith(")")).toBe(true);
			}
		});
	}

	it("formatContentPreview none for null/undefined", () => {
		expect(LogFormatter.formatContentPreview(null as any)).toBe("none");
		expect(LogFormatter.formatContentPreview(undefined as any)).toBe("none");
	});

	it("formatResponsePreview none when content missing", () => {
		expect(LogFormatter.formatResponsePreview(new LlmResponse())).toBe("none");
		expect(
			LogFormatter.formatResponsePreview(
				new LlmResponse({ content: undefined }),
			),
		).toBe("none");
	});

	it("formatFunctionResponse none for missing functionResponse", () => {
		expect(LogFormatter.formatFunctionResponse({} as Part)).toBe("none");
		expect(LogFormatter.formatFunctionResponse({ text: "x" } as Part)).toBe(
			"none",
		);
	});

	it("formatContentParts no parts for missing/empty", () => {
		expect(LogFormatter.formatContentParts({} as Content)).toEqual([
			"no parts",
		]);
		expect(
			LogFormatter.formatContentParts({ role: "user" } as Content),
		).toEqual(["no parts"]);
	});
});

describe("LogFormatter leftover circular / bigint / error edges", () => {
	it("formatFunctionCalls throws on circular args (JSON.stringify)", () => {
		const circular: Record<string, unknown> = { a: 1 };
		circular.self = circular;
		expect(() =>
			LogFormatter.formatFunctionCalls([
				{ functionCall: { name: "circ", args: circular } as FunctionCall },
			]),
		).toThrow();
	});

	it("formatSingleFunctionCall throws on circular args", () => {
		const circular: any = { x: 1 };
		circular.self = circular;
		expect(() =>
			LogFormatter.formatSingleFunctionCall({
				name: "c",
				args: circular,
			} as FunctionCall),
		).toThrow();
	});

	it("formatFunctionCalls throws on bigint args", () => {
		expect(() =>
			LogFormatter.formatFunctionCalls([
				{
					functionCall: {
						name: "big",
						args: { n: BigInt(10) },
					} as FunctionCall,
				},
			]),
		).toThrow();
	});

	it("formatSingleFunctionCall throws on bigint args", () => {
		expect(() =>
			LogFormatter.formatSingleFunctionCall({
				name: "big",
				args: { n: BigInt(99) },
			} as FunctionCall),
		).toThrow();
	});

	it("formatFunctionResponse throws on circular response payload", () => {
		const circular: any = {};
		circular.self = circular;
		expect(() =>
			LogFormatter.formatFunctionResponse({
				functionResponse: { name: "r", response: circular },
			} as Part),
		).toThrow();
	});

	it("formatFunctionResponse throws on bigint response payload", () => {
		expect(() =>
			LogFormatter.formatFunctionResponse({
				functionResponse: { name: "r", response: { n: BigInt(1) } },
			} as Part),
		).toThrow();
	});

	it("formatContentPreview fallback stringify throws on circular non-parts content", () => {
		const circular: any = { role: "user" };
		circular.self = circular;
		expect(() =>
			LogFormatter.formatContentPreview(circular as Content),
		).toThrow();
	});

	it("Error instances inside args stringify to empty object", () => {
		const result = LogFormatter.formatFunctionCalls([
			{
				functionCall: {
					name: "with_err",
					args: { err: new Error("boom") },
				} as FunctionCall,
			},
		]);
		expect(result).toContain("with_err");
		expect(result).toContain("{}");
	});

	it("formatSingleFunctionCall pretty-prints Error args as {}", () => {
		const result = LogFormatter.formatSingleFunctionCall({
			name: "e",
			args: { e: new Error("x") },
		} as FunctionCall);
		expect(result).toContain("e(");
		expect(result).toContain("{}");
	});

	it("formatFunctionResponse with Error response becomes {}", () => {
		const result = LogFormatter.formatFunctionResponse({
			functionResponse: {
				name: "fn",
				response: new Error("nope") as any,
			},
		} as Part);
		expect(result).toBe("fn -> {}");
	});
});

describe("LogFormatter leftover truncation / part-type matrices", () => {
	const lengths = [0, 1, 49, 50, 51, 80, 81, 120];
	for (const len of lengths) {
		it(`text preview boundary length ${len}`, () => {
			const text = "x".repeat(len);
			const preview = LogFormatter.formatContentPreview({
				role: "user",
				parts: [{ text }],
			});
			if (len === 0) {
				expect(preview).toBe("no text content");
			} else if (len > 80) {
				expect(preview.endsWith("...")).toBe(true);
				expect(preview.length).toBe(83);
			} else {
				expect(preview).toBe(text);
			}
		});
	}

	const partFixtures: Array<{ label: string; part: Part; type: string }> = [
		{ label: "text", part: { text: "hello" }, type: "text" },
		{
			label: "function_call",
			part: { functionCall: { name: "f", args: { a: 1 } } as FunctionCall },
			type: "function_call",
		},
		{
			label: "function_response",
			part: {
				functionResponse: { name: "f", response: { ok: true } },
			} as Part,
			type: "function_response",
		},
		{
			label: "file_data",
			part: { fileData: { mimeType: "text/plain", fileUri: "gs://x" } } as Part,
			type: "file_data",
		},
		{
			label: "executable_code",
			part: {
				executableCode: { code: "print(1)", language: "PYTHON" as any },
			},
			type: "executable_code",
		},
		{
			label: "code_execution_result",
			part: {
				codeExecutionResult: { outcome: "OUTCOME_OK" as any, output: "1" },
			},
			type: "code_execution_result",
		},
		{ label: "unknown", part: {} as Part, type: "unknown" },
	];

	for (const { label, part, type } of partFixtures) {
		it(`formatContentParts type ${label}`, () => {
			const lines = LogFormatter.formatContentParts({
				role: "model",
				parts: [part],
			});
			expect(lines).toHaveLength(1);
			expect(lines[0]).toContain(`[0] ${type}:`);
		});
	}

	it("formatContentParts indexes multiple mixed parts", () => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [
				{ text: "a" },
				{ functionCall: { name: "g", args: {} } as FunctionCall },
				{},
			],
		});
		expect(lines).toHaveLength(3);
		expect(lines[0]).toMatch(/^\[0\] text:/);
		expect(lines[1]).toMatch(/^\[1\] function_call:/);
		expect(lines[2]).toMatch(/^\[2\] unknown:/);
	});

	it("long executable code preview truncates at 50", () => {
		const code = "c".repeat(60);
		const lines = LogFormatter.formatContentParts({
			parts: [{ executableCode: { code, language: "PYTHON" as any } }],
		});
		expect(lines[0]).toContain("...");
		expect(lines[0]).toContain(`"${code.substring(0, 50)}..."`);
	});

	it("file_data without mimeType shows unknown type", () => {
		const lines = LogFormatter.formatContentParts({
			parts: [{ fileData: { fileUri: "x" } as any }],
		});
		expect(lines[0]).toContain("file: unknown type");
	});

	it("code_execution_result without outcome shows unknown", () => {
		const lines = LogFormatter.formatContentParts({
			parts: [{ codeExecutionResult: {} as any }],
		});
		expect(lines[0]).toContain("execution result: unknown");
	});

	it("formatResponsePreview delegates to content preview", () => {
		const resp = new LlmResponse({
			content: { role: "model", parts: [{ text: "hello world" }] },
		});
		expect(LogFormatter.formatResponsePreview(resp)).toBe("hello world");
	});

	it("content without parts array falls back to JSON stringify", () => {
		const content = { role: "user", text: "legacy" } as any;
		expect(LogFormatter.formatContentPreview(content)).toBe(
			JSON.stringify(content),
		);
	});

	it("empty parts array yields no text content", () => {
		expect(LogFormatter.formatContentPreview({ role: "user", parts: [] })).toBe(
			"no text content",
		);
	});

	it.each([
		{ label: "empty string", text: "", expectedType: "text", preview: '""' },
		{ label: "0", text: 0 as any, expectedType: "text", preview: '"0"' },
		{
			label: "false",
			text: false as any,
			expectedType: "text",
			preview: '"false"',
		},
	])("getPartType uses !== undefined so text=$label is still text", ({
		text,
		expectedType,
		preview,
	}) => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ text } as Part],
		});
		expect(lines[0]).toContain(`[0] ${expectedType}:`);
		expect(lines[0]).toContain(preview);
	});

	it("text:null is still typed text via !== undefined then throws on .length", () => {
		expect(() =>
			LogFormatter.formatContentParts({
				role: "model",
				parts: [{ text: null as any }],
			}),
		).toThrow();
	});

	it("functionCall:null is typed function_call (!== undefined) then throws on args access", () => {
		expect(() =>
			LogFormatter.formatContentParts({
				role: "model",
				parts: [{ functionCall: null as any }],
			}),
		).toThrow();
	});

	const argBoundary = [
		{ n: 49, repeat: 41 },
		{ n: 50, repeat: 42 },
		{ n: 51, repeat: 43 },
	];
	for (const { n, repeat } of argBoundary) {
		it(`function call args JSON length boundary ${n}`, () => {
			const args = { x: "a".repeat(repeat) };
			const encoded = JSON.stringify(args);
			expect(encoded.length).toBe(n);
			const result = LogFormatter.formatFunctionCalls([
				{ functionCall: { name: "b", args } as FunctionCall },
			]);
			if (n > 50) {
				expect(result).toContain("...");
			} else {
				expect(result).toBe(`b(${encoded})`);
			}
		});
	}
});
