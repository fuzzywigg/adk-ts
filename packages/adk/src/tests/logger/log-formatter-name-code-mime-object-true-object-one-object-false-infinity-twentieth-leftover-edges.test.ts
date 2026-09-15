import type { FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Twentieth leftover residual deepen after tip #289 / #292:
 * nineteenth pinned name/code/mime true/`"true"`/`[]`/`-0`. Residual:
 * `Object(true)` / `Object(1)` / `Object(false)` / `"Infinity"` template
 * and `||` / `!== undefined` coercion asymmetries.
 */
describe("LogFormatter name/code/mime object-true/one/false/infinity twentieth leftover", () => {
	it.each([
		{ label: "Object(true)", name: Object(true), expected: "true({})" },
		{ label: "Object(1)", name: Object(1), expected: "1({})" },
		{ label: "Object(false)", name: Object(false), expected: "false({})" },
		{ label: 'string "Infinity"', name: "Infinity", expected: "Infinity({})" },
	])("formatFunctionCalls name=$label template-coerces", ({
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
		{ label: "Object(true)", name: Object(true), expected: "true(\n{}\n)" },
		{ label: "Object(1)", name: Object(1), expected: "1(\n{}\n)" },
		{ label: "Object(false)", name: Object(false), expected: "false(\n{}\n)" },
		{
			label: 'string "Infinity"',
			name: "Infinity",
			expected: "Infinity(\n{}\n)",
		},
	])("formatSingleFunctionCall name=$label template-coerces", ({
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
		{ label: "Object(true)", name: Object(true), expected: "true -> {}" },
		{ label: "Object(1)", name: Object(1), expected: "1 -> {}" },
		{ label: "Object(false)", name: Object(false), expected: "false -> {}" },
		{
			label: 'string "Infinity"',
			name: "Infinity",
			expected: "Infinity -> {}",
		},
	])("formatFunctionResponse name=$label template-coerces", ({
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
		{ label: "Object(true)", code: Object(true), expected: '"true"' },
		{ label: "Object(1)", code: Object(1), expected: '"1"' },
		{ label: "Object(false)", code: Object(false), expected: '"false"' },
		{ label: 'string "Infinity"', code: "Infinity", expected: '"Infinity"' },
	])("executableCode.code=$label kept via ||", ({ code, expected }) => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ executableCode: { code, language: "PYTHON" } as any }],
		});
		expect(lines[0]).toContain(`executable_code: ${expected}`);
	});

	it.each([
		{ label: "Object(true)", mimeType: Object(true), expected: "file: true" },
		{ label: "Object(1)", mimeType: Object(1), expected: "file: 1" },
		{
			label: "Object(false)",
			mimeType: Object(false),
			expected: "file: false",
		},
		{
			label: 'string "Infinity"',
			mimeType: "Infinity",
			expected: "file: Infinity",
		},
	])("mimeType=$label kept via ||", ({ mimeType, expected }) => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "gs://x", mimeType } as any }],
		});
		expect(lines[0]).toContain(expected);
		expect(lines[0]).not.toContain("unknown type");
	});

	it.each([
		{ label: "Object(true)", text: Object(true), expected: '"true"' },
		{ label: "Object(1)", text: Object(1), expected: '"1"' },
		{ label: "Object(false)", text: Object(false), expected: '"false"' },
		{ label: 'string "Infinity"', text: "Infinity", expected: '"Infinity"' },
	])("part.text=$label kept via !== undefined", ({ text, expected }) => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ text } as any],
		});
		expect(lines[0]).toBe(`[0] text: ${expected}`);
	});
});
