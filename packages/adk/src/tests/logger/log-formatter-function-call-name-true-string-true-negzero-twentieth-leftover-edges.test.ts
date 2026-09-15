import type { FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Twentieth leftover residual after tip #261 / open #275 nineteenth:
 * #261/#275 pinned nested args/response and top-level functionCall/
 * functionResponse truthiness. Residual: `fc.name` / `response.name`
 * template coercion — true/`"true"` keep; `[]` → empty name; `-0` → `"0"`.
 */
describe("LogFormatter FC/FR name true/string-true/negzero twentieth leftover", () => {
	it.each([
		{ label: "boolean true", name: true, expected: "true({})" },
		{ label: '"true"', name: "true", expected: "true({})" },
		{ label: "empty array", name: [], expected: "({})" },
		{ label: "-0", name: -0, expected: "0({})" },
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
		{ label: "boolean true", name: true, expected: "true(\n{}\n)" },
		{ label: '"true"', name: "true", expected: "true(\n{}\n)" },
		{ label: "empty array", name: [], expected: "(\n{}\n)" },
		{ label: "-0", name: -0, expected: "0(\n{}\n)" },
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
		{ label: "boolean true", name: true, expected: "true -> {}" },
		{ label: '"true"', name: "true", expected: "true -> {}" },
		{ label: "empty array", name: [], expected: " -> {}" },
		{ label: "-0", name: -0, expected: "0 -> {}" },
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
