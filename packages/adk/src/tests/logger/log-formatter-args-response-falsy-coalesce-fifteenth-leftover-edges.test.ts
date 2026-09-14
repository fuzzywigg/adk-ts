import type { FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";

/**
 * Fifteenth leftover: `fc.args ?` / `response.response ?` coalesce falsy
 * primitives `0`/`""`/`false` to `"{}"` (nullish matrix covered null/undefined
 * only). `mimeType ||` : numeric/boolean falsy → unknown; `"0"` kept.
 */
describe("LogFormatter args/response falsy coalesce fifteenth leftover", () => {
	it.each([
		{ label: "0", args: 0 },
		{ label: '""', args: "" },
		{ label: "false", args: false },
	] as const)("formatFunctionCalls args=$label coalesces to fn({})", ({
		args,
	}) => {
		const parts: Part[] = [
			{ functionCall: { name: "fn", args } as unknown as FunctionCall },
		];
		expect(LogFormatter.formatFunctionCalls(parts)).toBe("fn({})");
	});

	it.each([
		{ label: "0", args: 0 },
		{ label: '""', args: "" },
		{ label: "false", args: false },
	] as const)("formatSingleFunctionCall args=$label coalesces to pretty {}", ({
		args,
	}) => {
		expect(
			LogFormatter.formatSingleFunctionCall({
				name: "fn",
				args,
			} as unknown as FunctionCall),
		).toBe("fn(\n{}\n)");
	});

	it.each([
		{ label: "0", response: 0 },
		{ label: '""', response: "" },
		{ label: "false", response: false },
	] as const)("formatFunctionResponse response=$label coalesces to name -> {}", ({
		response,
	}) => {
		expect(
			LogFormatter.formatFunctionResponse({
				functionResponse: { name: "tool", response },
			} as Part),
		).toBe("tool -> {}");
	});

	it.each([
		{ label: "0", mimeType: 0, expected: "file: unknown type" },
		{ label: "false", mimeType: false, expected: "file: unknown type" },
		{ label: '"0"', mimeType: "0", expected: "file: 0" },
	] as const)("getPartPreview mimeType=$label via || gate", ({
		mimeType,
		expected,
	}) => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ fileData: { fileUri: "gs://x", mimeType } as any }],
		});
		expect(lines[0]).toContain(expected);
	});
});
