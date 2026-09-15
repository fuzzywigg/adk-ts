import type { Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Nineteenth leftover residual after tip #261 / #253:
 * #253/#261 pinned nested `args ?` / `response ?` fields. Residual: top-level
 * `part.functionCall` / `part.functionResponse` truthiness — true/"true"/[]
 * keep into undefined name + {}; `-0` filters/coalesces to "" / "none";
 * outcome=[] → empty string after `||` miss.
 */
describe("LogFormatter FC/FR top-level true/string-true/negzero nineteenth leftover", () => {
	it.each([
		{ label: "boolean true", functionCall: true },
		{ label: '"true"', functionCall: "true" },
		{ label: "empty array", functionCall: [] },
		{ label: "number 1", functionCall: 1 },
	] as const)("formatFunctionCalls functionCall=$label → undefined({})", ({
		functionCall,
	}) => {
		expect(
			LogFormatter.formatFunctionCalls([{ functionCall } as unknown as Part]),
		).toBe("undefined({})");
	});

	it("formatFunctionCalls functionCall=-0 filters to '' (not early none)", () => {
		expect(
			LogFormatter.formatFunctionCalls([
				{ functionCall: -0 } as unknown as Part,
			]),
		).toBe("");
		expect(LogFormatter.formatFunctionCalls([])).toBe("none");
	});

	it.each([
		{ label: "boolean true", functionResponse: true },
		{ label: '"true"', functionResponse: "true" },
		{ label: "empty array", functionResponse: [] },
		{ label: "empty object", functionResponse: {} },
	] as const)("formatFunctionResponse functionResponse=$label → undefined -> {}", ({
		functionResponse,
	}) => {
		expect(
			LogFormatter.formatFunctionResponse({
				functionResponse,
			} as unknown as Part),
		).toBe("undefined -> {}");
	});

	it("formatFunctionResponse functionResponse=-0 → none via !functionResponse", () => {
		expect(
			LogFormatter.formatFunctionResponse({
				functionResponse: -0,
			} as unknown as Part),
		).toBe("none");
	});

	it("codeExecutionResult.outcome=[] → empty via array toString (not unknown)", () => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ codeExecutionResult: { outcome: [] as any } }],
		});
		expect(lines[0]).toBe("[0] code_execution_result: execution result: ");
		expect(lines[0]).not.toContain("unknown");
	});
});
