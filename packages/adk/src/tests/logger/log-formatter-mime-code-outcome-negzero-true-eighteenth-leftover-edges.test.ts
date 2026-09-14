import type { Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Eighteenth leftover (logger/env residual HEAVY): LogFormatter `mimeType ||` /
 * `code ||` / `outcome ||` / `args ?` SameValueZero `-0` collapse vs keep for
 * boolean `true` / `[]` / `NEGATIVE_INFINITY` / string `"true"` after
 * seventeenth string `"0"`/`"false"` and boolean-true content/parts port.
 */
describe("LogFormatter mime/code/outcome/args negzero-true eighteenth leftover", () => {
	it("mimeType=-0 collapses to unknown type", () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "f", mimeType: -0 as any } } as Part],
		});
		expect(lines[0]).toBe("[0] file_data: file: unknown type");
	});

	it.each([
		{ label: "boolean true", value: true, expect: "file: true" },
		{
			label: "NEGATIVE_INFINITY",
			value: Number.NEGATIVE_INFINITY,
			expect: "file: -Infinity",
		},
		{ label: 'string "true"', value: "true", expect: "file: true" },
	])("mimeType=$label kept via ||", ({ value, expect: expected }) => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "f", mimeType: value as any } } as Part],
		});
		expect(lines[0]).toBe(`[0] file_data: ${expected}`);
	});

	it("mimeType=[] truthy → empty string interpolation (not unknown)", () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "f", mimeType: [] as any } } as Part],
		});
		expect(lines[0]).toBe("[0] file_data: file: ");
		expect(lines[0]).not.toContain("unknown type");
	});

	it("executableCode.code=-0 collapses to empty quoted string", () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [
				{ executableCode: { language: "PYTHON", code: -0 as any } } as Part,
			],
		});
		expect(lines[0]).toBe('[0] executable_code: ""');
	});

	it.each([
		{ label: "boolean true", value: true, expect: '"true"' },
		{
			label: "NEGATIVE_INFINITY",
			value: Number.NEGATIVE_INFINITY,
			expect: '"-Infinity"',
		},
		{ label: 'string "true"', value: "true", expect: '"true"' },
	])("executableCode.code=$label kept", ({ value, expect: expected }) => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [
				{ executableCode: { language: "PYTHON", code: value as any } } as Part,
			],
		});
		expect(lines[0]).toBe(`[0] executable_code: ${expected}`);
	});

	it("codeExecutionResult.outcome=-0 collapses to unknown", () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [
				{
					codeExecutionResult: { outcome: -0 as any, output: "" },
				} as Part,
			],
		});
		expect(lines[0]).toBe(
			"[0] code_execution_result: execution result: unknown",
		);
	});

	it.each([
		{ label: "boolean true", value: true, expect: "true" },
		{
			label: "NEGATIVE_INFINITY",
			value: Number.NEGATIVE_INFINITY,
			expect: "-Infinity",
		},
		{ label: 'string "true"', value: "true", expect: "true" },
		{ label: "empty array", value: [], expect: "" },
	])("codeExecutionResult.outcome=$label kept", ({
		value,
		expect: expected,
	}) => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [
				{
					codeExecutionResult: { outcome: value as any, output: "" },
				} as Part,
			],
		});
		expect(lines[0]).toBe(
			`[0] code_execution_result: execution result: ${expected}`,
		);
	});

	it("functionCall.args=-0 collapses to {}", () => {
		expect(
			LogFormatter.formatFunctionCalls([
				{ functionCall: { name: "fn", args: -0 as any } } as Part,
			]),
		).toBe("fn({})");
	});

	it.each([
		{ label: "empty array", value: [], expect: "fn([])" },
		{
			label: "NEGATIVE_INFINITY",
			value: Number.NEGATIVE_INFINITY,
			expect: "fn(null)",
		},
		{ label: 'string "true"', value: "true", expect: 'fn("true")' },
	])("functionCall.args=$label JSON.stringifies", ({
		value,
		expect: expected,
	}) => {
		expect(
			LogFormatter.formatFunctionCalls([
				{ functionCall: { name: "fn", args: value as any } } as Part,
			]),
		).toBe(expected);
	});
});
