import type { FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Nineteenth leftover residual deepen after tip #289 / f93c037:
 * tip pinned FC/FR `.name` true/`"true"`/`[]`/`-0`. Residual: +Infinity /
 * NaN / {} / Object(true) / 1 template coercion asymmetries.
 */
describe("LogFormatter FC/FR name posinf/nan/object-true nineteenth residual deepen", () => {
	it.each([
		{
			label: "Infinity",
			name: Number.POSITIVE_INFINITY,
			expected: "Infinity({})",
		},
		{ label: "NaN", name: Number.NaN, expected: "NaN({})" },
		{ label: "empty object", name: {}, expected: "[object Object]({})" },
		{ label: "Object(true)", name: Object(true), expected: "true({})" },
		{ label: "number 1", name: 1, expected: "1({})" },
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
		{
			label: "Infinity",
			name: Number.POSITIVE_INFINITY,
			expected: "Infinity(\n{}\n)",
		},
		{ label: "NaN", name: Number.NaN, expected: "NaN(\n{}\n)" },
		{ label: "empty object", name: {}, expected: "[object Object](\n{}\n)" },
		{ label: "Object(true)", name: Object(true), expected: "true(\n{}\n)" },
		{ label: "number 1", name: 1, expected: "1(\n{}\n)" },
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
		{
			label: "Infinity",
			name: Number.POSITIVE_INFINITY,
			expected: "Infinity -> {}",
		},
		{ label: "NaN", name: Number.NaN, expected: "NaN -> {}" },
		{ label: "empty object", name: {}, expected: "[object Object] -> {}" },
		{ label: "Object(true)", name: Object(true), expected: "true -> {}" },
		{ label: "number 1", name: 1, expected: "1 -> {}" },
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
});
