import type { Content, FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";
import { LlmResponse } from "../../models/llm-response";

describe("LogFormatter heavy matrix — formatFunctionCalls", () => {
	it("returns none for empty/null/undefined", () => {
		expect(LogFormatter.formatFunctionCalls([])).toBe("none");
		expect(LogFormatter.formatFunctionCalls(null as any)).toBe("none");
		expect(LogFormatter.formatFunctionCalls(undefined as any)).toBe("none");
	});

	it.each([
		[{}, "{}"],
		[{ a: 1 }, '{"a":1}'],
		[{ x: "short" }, '{"x":"short"}'],
	])("formats args %j without ellipsis when short", (args, encoded) => {
		const result = LogFormatter.formatFunctionCalls([
			{ functionCall: { name: "fn", args } as FunctionCall },
		]);
		expect(result).toBe(`fn(${encoded})`);
		expect(result).not.toContain("...");
	});

	it("appends ellipsis when args JSON exceeds 50 chars", () => {
		const args = { x: "a".repeat(43) };
		expect(JSON.stringify(args).length).toBeGreaterThan(50);
		expect(
			LogFormatter.formatFunctionCalls([
				{ functionCall: { name: "over", args } as FunctionCall },
			]),
		).toContain("...");
	});

	it("does not ellipsize when args JSON is exactly 50 chars", () => {
		const args = { x: "a".repeat(42) };
		expect(JSON.stringify(args).length).toBe(50);
		const result = LogFormatter.formatFunctionCalls([
			{ functionCall: { name: "exact", args } as FunctionCall },
		]);
		expect(result).not.toContain("...");
	});

	it("formats multiple calls with comma-space separators", () => {
		expect(
			LogFormatter.formatFunctionCalls([
				{ functionCall: { name: "a", args: {} } as FunctionCall },
				{ functionCall: { name: "b", args: { z: 1 } } as FunctionCall },
			]),
		).toBe('a({}), b({"z":1})');
	});

	it("filters out parts without functionCall", () => {
		expect(
			LogFormatter.formatFunctionCalls([
				{ text: "regular" },
				{ functionCall: { name: "only", args: {} } as FunctionCall },
			]),
		).toBe("only({})");
	});

	it("returns empty string when every part lacks functionCall", () => {
		expect(
			LogFormatter.formatFunctionCalls([
				{ text: "only text" },
				{ functionResponse: { name: "x", response: {} } } as Part,
			]),
		).toBe("");
	});

	it("formats missing name as undefined(...)", () => {
		expect(
			LogFormatter.formatFunctionCalls([
				{ functionCall: { args: { x: 1 } } as FunctionCall },
			]),
		).toBe('undefined({"x":1})');
	});

	it("defaults missing args to {}", () => {
		expect(
			LogFormatter.formatFunctionCalls([
				{ functionCall: { name: "no_args" } as FunctionCall },
			]),
		).toBe("no_args({})");
	});
});

describe("LogFormatter heavy matrix — formatContentPreview", () => {
	it.each([undefined, null])("returns none for %j content", (content) => {
		expect(LogFormatter.formatContentPreview(content as any)).toBe("none");
	});

	it.each([
		["Hello", "Hello"],
		["a".repeat(80), "a".repeat(80)],
		["a".repeat(81), `${"a".repeat(80)}...`],
	])("formats text length %s", (text, expected) => {
		expect(
			LogFormatter.formatContentPreview({
				role: "user",
				parts: [{ text }],
			}),
		).toBe(expected);
	});

	it("joins multiple text parts with spaces", () => {
		expect(
			LogFormatter.formatContentPreview({
				role: "user",
				parts: [{ text: "Hello" }, { text: "world" }],
			}),
		).toBe("Hello world");
	});

	it("filters non-text parts", () => {
		expect(
			LogFormatter.formatContentPreview({
				role: "user",
				parts: [
					{ text: "A" },
					{ functionCall: { name: "t", args: {} } as FunctionCall },
					{ text: "B" },
				],
			}),
		).toBe("A B");
	});

	it("returns no text content for empty/falsy text parts", () => {
		expect(LogFormatter.formatContentPreview({ role: "user", parts: [] })).toBe(
			"no text content",
		);
		expect(
			LogFormatter.formatContentPreview({
				role: "user",
				parts: [{ text: "" }, { text: undefined as any }],
			}),
		).toBe("no text content");
	});

	it("falls back to JSON when parts missing", () => {
		const content = { role: "user", custom: "payload" } as Content;
		expect(LogFormatter.formatContentPreview(content)).toBe(
			JSON.stringify(content),
		);
	});

	it("truncates JSON fallback longer than 80 chars", () => {
		const content = { role: "user", blob: "a".repeat(100) } as Content;
		const result = LogFormatter.formatContentPreview(content);
		expect(result.endsWith("...")).toBe(true);
		expect(result.length).toBe(83);
	});
});

describe("LogFormatter heavy matrix — formatResponsePreview", () => {
	it("returns none without content", () => {
		expect(LogFormatter.formatResponsePreview(new LlmResponse({}))).toBe(
			"none",
		);
	});

	it("delegates to formatContentPreview for text", () => {
		expect(
			LogFormatter.formatResponsePreview(
				new LlmResponse({
					content: { role: "model", parts: [{ text: "Response" }] },
				}),
			),
		).toBe("Response");
	});

	it("reports no text for tool-only content", () => {
		expect(
			LogFormatter.formatResponsePreview(
				new LlmResponse({
					content: {
						role: "model",
						parts: [
							{ functionCall: { name: "tool", args: {} } as FunctionCall },
						],
					},
				}),
			),
		).toBe("no text content");
	});

	it("truncates long response text", () => {
		expect(
			LogFormatter.formatResponsePreview(
				new LlmResponse({
					content: { role: "model", parts: [{ text: "a".repeat(100) }] },
				}),
			),
		).toContain("...");
	});
});

describe("LogFormatter heavy matrix — formatSingleFunctionCall / response / parts", () => {
	it("pretty-prints single function call args", () => {
		const result = LogFormatter.formatSingleFunctionCall({
			name: "test",
			args: { nested: { key: "value" } },
		});
		expect(result).toContain("test");
		expect(result.split("\n").length).toBeGreaterThan(1);
	});

	it("formats single call without args as empty object", () => {
		expect(LogFormatter.formatSingleFunctionCall({ name: "no_args" })).toBe(
			"no_args(\n{}\n)",
		);
	});

	it("formatFunctionResponse handles missing and present payloads", () => {
		expect(LogFormatter.formatFunctionResponse({} as Part)).toBe("none");
		expect(
			LogFormatter.formatFunctionResponse({
				functionResponse: { name: "empty" } as any,
			}),
		).toBe("empty -> {}");
		const pretty = LogFormatter.formatFunctionResponse({
			functionResponse: {
				name: "lookup",
				response: { a: 1, b: { c: 2 } },
			},
		});
		expect(pretty).toContain("lookup ->");
		expect(pretty.split("\n").length).toBeGreaterThan(1);
	});

	it("formatContentParts returns no parts / empty array edges", () => {
		expect(LogFormatter.formatContentParts({ role: "user" })).toEqual([
			"no parts",
		]);
		expect(
			LogFormatter.formatContentParts({ role: "user", parts: [] }),
		).toEqual([]);
	});

	it.each([
		[{ text: "Hello" }, /\[0\] text:/],
		[
			{ functionCall: { name: "f", args: {} } as FunctionCall },
			/\[0\] function_call:/,
		],
		[
			{
				functionResponse: { name: "r", response: { ok: true } },
			},
			/\[0\] function_response:/,
		],
		[
			{ fileData: { mimeType: "text/csv", fileUri: "gs://x" } as any },
			/file_data: file: text\/csv/,
		],
		[
			{
				executableCode: { code: "print(1)", language: "PYTHON" as any },
			},
			/executable_code:/,
		],
		[
			{
				codeExecutionResult: {
					outcome: "OUTCOME_OK" as any,
					output: "1",
				},
			},
			/code_execution_result:/,
		],
		[{} as Part, /unknown: unknown content/],
	])("formats part type %#", (part, pattern) => {
		const [line] = LogFormatter.formatContentParts({
			role: "user",
			parts: [part],
		});
		expect(line).toMatch(pattern);
	});

	it("ellipsizes part text longer than 50 chars but not exactly 50", () => {
		const exact = "b".repeat(50);
		const over = "b".repeat(51);
		expect(
			LogFormatter.formatContentParts({
				role: "user",
				parts: [{ text: exact }],
			})[0],
		).toBe(`[0] text: "${exact}"`);
		expect(
			LogFormatter.formatContentParts({
				role: "user",
				parts: [{ text: over }],
			})[0],
		).toBe(`[0] text: "${"b".repeat(50)}..."`);
	});

	it("uses unknown type/outcome fallbacks", () => {
		const result = LogFormatter.formatContentParts({
			role: "model",
			parts: [
				{ fileData: { fileUri: "gs://missing-mime" } as any },
				{
					codeExecutionResult: { output: "ok" } as any,
				},
				{ executableCode: { language: "PYTHON" as any } as any },
			],
		});
		expect(result[0]).toContain("file: unknown type");
		expect(result[1]).toContain("execution result: unknown");
		expect(result[2]).toContain('executable_code: ""');
	});

	it("truncates long executable code in formatContentParts", () => {
		const [line] = LogFormatter.formatContentParts({
			role: "model",
			parts: [
				{
					executableCode: {
						code: "c".repeat(60),
						language: "PYTHON" as any,
					},
				},
			],
		});
		expect(line).toMatch(/executable_code: "c{50}\.\.\."/);
	});
});
