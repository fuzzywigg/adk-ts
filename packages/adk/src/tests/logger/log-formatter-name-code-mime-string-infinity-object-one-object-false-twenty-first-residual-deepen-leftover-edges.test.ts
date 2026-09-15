import type { FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Twenty-first leftover residual deepen after tip #292 / 5156762:
 * nineteenth pinned FC/FR name + code/mime/text true/`"true"`/`[]`/`-0`.
 * Residual: string `"Infinity"` / `Object(1)` / `Object(false)` template /
 * `||` / `!== undefined` asymmetries (boxed false stays truthy).
 */
describe("LogFormatter name/code/mime string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it.each([
		{ label: '"Infinity"', name: "Infinity", expected: "Infinity({})" },
		{ label: "Object(1)", name: Object(1), expected: "1({})" },
		{ label: "Object(false)", name: Object(false), expected: "false({})" },
	] as const)("formatFunctionCalls name=$label template-coerces", ({
		name,
		expected,
	}) => {
		expect(
			LogFormatter.formatFunctionCalls([
				{
					functionCall: { name, args: undefined } as unknown as FunctionCall,
				} as Part,
			]),
		).toBe(expected);
	});

	it.each([
		{ label: '"Infinity"', name: "Infinity", expected: "Infinity(\n{}\n)" },
		{ label: "Object(1)", name: Object(1), expected: "1(\n{}\n)" },
		{ label: "Object(false)", name: Object(false), expected: "false(\n{}\n)" },
	] as const)("formatSingleFunctionCall name=$label template-coerces", ({
		name,
		expected,
	}) => {
		expect(
			LogFormatter.formatSingleFunctionCall({
				name,
				args: undefined,
			} as unknown as FunctionCall),
		).toBe(expected);
	});

	it.each([
		{ label: '"Infinity"', name: "Infinity", expected: "Infinity -> {}" },
		{ label: "Object(1)", name: Object(1), expected: "1 -> {}" },
		{ label: "Object(false)", name: Object(false), expected: "false -> {}" },
	] as const)("formatFunctionResponse name=$label template-coerces", ({
		name,
		expected,
	}) => {
		expect(
			LogFormatter.formatFunctionResponse({
				functionResponse: { name, response: undefined },
			} as unknown as Part),
		).toBe(expected);
	});

	it.each([
		{ label: '"Infinity"', code: "Infinity", expected: '"Infinity"' },
		{ label: "Object(1)", code: Object(1), expected: '"1"' },
		{ label: "Object(false)", code: Object(false), expected: '"false"' },
	] as const)("executableCode.code=$label kept via ||", ({
		code,
		expected,
	}) => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ executableCode: { code, language: "PYTHON" } as any }],
		});
		expect(lines[0]).toContain(`executable_code: ${expected}`);
	});

	it.each([
		{ label: '"Infinity"', mimeType: "Infinity", expected: "file: Infinity" },
		{ label: "Object(1)", mimeType: Object(1), expected: "file: 1" },
		{
			label: "Object(false)",
			mimeType: Object(false),
			expected: "file: false",
		},
	] as const)("mimeType=$label kept via ||", ({ mimeType, expected }) => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "gs://x", mimeType } as any }],
		});
		expect(lines[0]).toContain(expected);
		expect(lines[0]).not.toContain("unknown type");
	});

	it.each([
		{ label: '"Infinity"', text: "Infinity", expected: '"Infinity"' },
		{ label: "Object(1)", text: Object(1), expected: '"1"' },
		{ label: "Object(false)", text: Object(false), expected: '"false"' },
	] as const)("part.text=$label kept via !== undefined (not !text)", ({
		text,
		expected,
	}) => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ text } as any],
		});
		expect(lines[0]).toBe(`[0] text: ${expected}`);
	});

	it.each([
		{
			label: '"Infinity"',
			args: "Infinity",
			expected: 'tool("Infinity")',
		},
		{ label: "Object(1)", args: Object(1), expected: "tool(1)" },
		{ label: "Object(false)", args: Object(false), expected: "tool(false)" },
	] as const)("formatFunctionCalls args=$label truthy JSON preview", ({
		args,
		expected,
	}) => {
		expect(
			LogFormatter.formatFunctionCalls([
				{
					functionCall: {
						name: "tool",
						args,
					} as unknown as FunctionCall,
				} as Part,
			]),
		).toBe(expected);
	});
});
