import type { FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Eighteenth leftover (HEAVY tip-relaunch residual after #227):
 * LogFormatter `args ?` / `response ?` / `code ||` / `outcome ||` /
 * `mimeType ||` / `part.text` — seventeenth kept `"0"`/`"false"`; fifteenth
 * coalesced falsy `0`/`false`/`""`. Residual: boolean `true` / `"true"` /
 * `[]` / `±Infinity` keep; SameValueZero `-0` coalesces like `0`.
 */
describe("LogFormatter args/response true/string-true/negzero/infinity eighteenth leftover", () => {
	it.each([
		{ label: "boolean true", args: true, preview: "true" },
		{ label: '"true"', args: "true", preview: '"true"' },
		{ label: "empty array", args: [], preview: "[]" },
		{
			label: "Infinity",
			args: Number.POSITIVE_INFINITY,
			preview: "null",
		},
		{
			label: "-Infinity",
			args: Number.NEGATIVE_INFINITY,
			preview: "null",
		},
	] as const)("formatFunctionCalls args=$label JSON.stringifies (not {})", ({
		args,
		preview,
	}) => {
		const parts: Part[] = [
			{ functionCall: { name: "fn", args } as unknown as FunctionCall },
		];
		expect(LogFormatter.formatFunctionCalls(parts)).toBe(`fn(${preview})`);
	});

	it("formatFunctionCalls args=-0 coalesces to fn({}) (SameValueZero)", () => {
		const parts: Part[] = [
			{ functionCall: { name: "fn", args: -0 } as unknown as FunctionCall },
		];
		expect(LogFormatter.formatFunctionCalls(parts)).toBe("fn({})");
	});

	it.each([
		{ label: "boolean true", response: true, body: "true" },
		{ label: '"true"', response: "true", body: '"true"' },
		{ label: "empty array", response: [], body: "[]" },
		{
			label: "Infinity",
			response: Number.POSITIVE_INFINITY,
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

	it("formatFunctionResponse response=-0 coalesces to {}", () => {
		expect(
			LogFormatter.formatFunctionResponse({
				functionResponse: { name: "tool", response: -0 },
			} as Part),
		).toBe("tool -> {}");
	});

	it.each([
		{ label: "boolean true", code: true, needle: '"true"' },
		{ label: '"true"', code: "true", needle: '"true"' },
	] as const)("executableCode.code=$label kept via ||", ({ code, needle }) => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ executableCode: { code, language: "PYTHON" } as any }],
		});
		expect(lines[0]).toContain(needle);
	});

	it("executableCode.code=[] → template empty string (array toString)", () => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ executableCode: { code: [], language: "PYTHON" } as any }],
		});
		expect(lines[0]).toContain('""');
	});

	it("executableCode.code=-0 coalesces to empty via ||", () => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ executableCode: { code: -0, language: "PYTHON" } as any }],
		});
		expect(lines[0]).toContain('""');
	});

	it.each([
		{
			label: "boolean true",
			outcome: true,
			expected: "execution result: true",
		},
		{ label: '"true"', outcome: "true", expected: "execution result: true" },
		{
			label: "Infinity",
			outcome: Number.POSITIVE_INFINITY,
			expected: "execution result: Infinity",
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

	it("codeExecutionResult.outcome=-0 coalesces to unknown", () => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ codeExecutionResult: { outcome: -0 } as any }],
		});
		expect(lines[0]).toContain("execution result: unknown");
	});

	it.each([
		{ label: "boolean true", mimeType: true, expected: "file: true" },
		{ label: '"true"', mimeType: "true", expected: "file: true" },
		{ label: "empty array", mimeType: [], expected: "file: " },
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

	it("mimeType=-0 coalesces to unknown type", () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "gs://x", mimeType: -0 } as any }],
		});
		expect(lines[0]).toContain("file: unknown type");
	});

	it.each([
		{ label: "boolean true", text: true, expected: "true" },
		{ label: '"true"', text: "true", expected: "true" },
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

	it("formatContentPreview text=[] joins to '' then || no text content", () => {
		const preview = LogFormatter.formatContentPreview({
			role: "user",
			parts: [{ text: [] as any }],
		});
		expect(preview).toBe("no text content");
	});

	it("formatContentPreview drops text=-0 via filter(Boolean)", () => {
		const preview = LogFormatter.formatContentPreview({
			role: "user",
			parts: [{ text: -0 as any }],
		});
		expect(preview).toBe("no text content");
	});
});
