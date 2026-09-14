import type { FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Seventeenth leftover: LogFormatter `args ?` / `response ?` / `code ||` /
 * `outcome ||` / `mimeType ||` keep truthy strings `"0"`/`"false"` (fifteenth
 * pinned falsy coalesce to `"{}"` / `""` / `unknown`; mime `"0"` only).
 */
describe("LogFormatter truthy-string OR coalesce seventeenth leftover", () => {
	it.each([
		{ label: '"0"', args: "0" },
		{ label: '"false"', args: "false" },
	] as const)("formatFunctionCalls args=$label JSON.stringifies (not {})", ({
		args,
	}) => {
		const parts: Part[] = [
			{ functionCall: { name: "fn", args } as unknown as FunctionCall },
		];
		expect(LogFormatter.formatFunctionCalls(parts)).toBe(
			`fn(${JSON.stringify(args)})`,
		);
	});

	it.each([
		{ label: '"0"', args: "0" },
		{ label: '"false"', args: "false" },
	] as const)("formatSingleFunctionCall args=$label pretty-keeps string", ({
		args,
	}) => {
		expect(
			LogFormatter.formatSingleFunctionCall({
				name: "fn",
				args,
			} as unknown as FunctionCall),
		).toBe(`fn(\n${JSON.stringify(args, null, 2)}\n)`);
	});

	it.each([
		{ label: '"0"', response: "0" },
		{ label: '"false"', response: "false" },
	] as const)("formatFunctionResponse response=$label keeps pretty JSON", ({
		response,
	}) => {
		expect(
			LogFormatter.formatFunctionResponse({
				functionResponse: { name: "tool", response },
			} as Part),
		).toBe(`tool -> ${JSON.stringify(response, null, 2)}`);
	});

	it.each([
		{ label: '"0"', code: "0" },
		{ label: '"false"', code: "false" },
	] as const)("executableCode.code=$label kept via || (not empty)", ({
		code,
	}) => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ executableCode: { code, language: "PYTHON" } as any }],
		});
		expect(lines[0]).toContain(`"${code}"`);
		expect(lines[0]).not.toContain('""');
	});

	it.each([
		{ label: '"0"', outcome: "0" },
		{ label: '"false"', outcome: "false" },
	] as const)("codeExecutionResult.outcome=$label kept (not unknown)", ({
		outcome,
	}) => {
		const lines = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ codeExecutionResult: { outcome } as any }],
		});
		expect(lines[0]).toContain(`execution result: ${outcome}`);
		expect(lines[0]).not.toContain("unknown");
	});

	it('mimeType="false" kept via || (fifteenth covered "0" only)', () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "gs://x", mimeType: "false" } as any }],
		});
		expect(lines[0]).toContain("file: false");
		expect(lines[0]).not.toContain("unknown type");
	});
});
