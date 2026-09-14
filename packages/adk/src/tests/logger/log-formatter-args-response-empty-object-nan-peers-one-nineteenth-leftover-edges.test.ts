import type { FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after #253):
 * LogFormatter `args ?` / `response ?` / `code ||` / `outcome ||` /
 * `mimeType ||` / `part.text` — eighteenth pinned true/`"true"`/`[]`/
 * ±Infinity/`-0`. Residual: peers `1` keep; NaN coalesces; empty `{}`
 * truthy object paths; `-Infinity` response; `[]` outcome template.
 */
describe("LogFormatter args/response empty-object/nan/peers-one nineteenth leftover", () => {
	it.each([
		{ label: "peers 1", args: 1, preview: "1" },
		{ label: "empty object", args: {}, preview: "{}" },
	] as const)("formatFunctionCalls args=$label takes truthy ? branch", ({
		args,
		preview,
	}) => {
		const parts: Part[] = [
			{ functionCall: { name: "fn", args } as unknown as FunctionCall },
		];
		expect(LogFormatter.formatFunctionCalls(parts)).toBe(`fn(${preview})`);
	});

	it("formatFunctionCalls args=NaN coalesces to fn({}) (falsy twin of -0)", () => {
		const parts: Part[] = [
			{
				functionCall: {
					name: "fn",
					args: Number.NaN,
				} as unknown as FunctionCall,
			},
		];
		expect(LogFormatter.formatFunctionCalls(parts)).toBe("fn({})");
	});

	it.each([
		{ label: "peers 1", response: 1, body: "1" },
		{ label: "empty object", response: {}, body: "{}" },
		{
			label: "-Infinity",
			response: Number.NEGATIVE_INFINITY,
			body: "null",
		},
	] as const)("formatFunctionResponse response=$label keeps pretty JSON", ({
		response,
		body,
	}) => {
		expect(
			LogFormatter.formatFunctionResponse({
				functionResponse: { name: "tool", response },
			} as Part),
		).toBe(`tool -> ${body}`);
	});

	it("formatFunctionResponse response=NaN coalesces to {}", () => {
		expect(
			LogFormatter.formatFunctionResponse({
				functionResponse: { name: "tool", response: Number.NaN },
			} as Part),
		).toBe("tool -> {}");
	});

	it.each([
		{ label: "Infinity", code: Number.POSITIVE_INFINITY, needle: '"Infinity"' },
		{ label: "peers 1", code: 1, needle: '"1"' },
		{
			label: "empty object",
			code: {},
			needle: '"[object Object]"',
		},
	] as const)("executableCode.code=$label kept via ||", ({ code, needle }) => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ executableCode: { code, language: "PYTHON" } as any }],
		});
		expect(lines[0]).toContain(needle);
	});

	it("executableCode.code=NaN coalesces to empty via ||", () => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [
				{ executableCode: { code: Number.NaN, language: "PYTHON" } as any },
			],
		});
		expect(lines[0]).toContain('""');
	});

	it.each([
		{
			label: "peers 1",
			outcome: 1,
			expected: "execution result: 1",
		},
		{
			label: "empty array",
			outcome: [],
			expected: "execution result: ",
		},
		{
			label: "-Infinity",
			outcome: Number.NEGATIVE_INFINITY,
			expected: "execution result: -Infinity",
		},
	] as const)("codeExecutionResult.outcome=$label kept (not unknown)", ({
		outcome,
		expected,
	}) => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ codeExecutionResult: { outcome } as any }],
		});
		expect(lines[0]).toContain(expected);
		expect(lines[0]).not.toContain("unknown");
	});

	it("codeExecutionResult.outcome=NaN coalesces to unknown", () => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ codeExecutionResult: { outcome: Number.NaN } as any }],
		});
		expect(lines[0]).toContain("execution result: unknown");
	});

	it.each([
		{
			label: "Infinity",
			mimeType: Number.POSITIVE_INFINITY,
			expected: "file: Infinity",
		},
		{ label: "peers 1", mimeType: 1, expected: "file: 1" },
		{
			label: "empty object",
			mimeType: {},
			expected: "file: [object Object]",
		},
	] as const)("mimeType=$label kept via || (not unknown type)", ({
		mimeType,
		expected,
	}) => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "gs://x", mimeType } as any }],
		});
		expect(lines[0]).toContain(expected);
		expect(lines[0]).not.toContain("unknown type");
	});

	it("mimeType=NaN coalesces to unknown type", () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "gs://x", mimeType: Number.NaN } as any }],
		});
		expect(lines[0]).toContain("file: unknown type");
	});

	it.each([
		{ label: "Infinity", text: Number.POSITIVE_INFINITY, expected: "Infinity" },
		{ label: "peers 1", text: 1, expected: "1" },
		{ label: "empty object", text: {}, expected: "[object Object]" },
	] as const)("formatContentPreview keeps truthy text=$label via filter", ({
		text,
		expected,
	}) => {
		const preview = LogFormatter.formatContentPreview({
			role: "user",
			parts: [{ text: text as any }],
		});
		expect(preview).toBe(expected);
	});

	it("formatContentPreview drops text=NaN via filter(Boolean)", () => {
		const preview = LogFormatter.formatContentPreview({
			role: "user",
			parts: [{ text: Number.NaN as any }],
		});
		expect(preview).toBe("no text content");
	});
});
