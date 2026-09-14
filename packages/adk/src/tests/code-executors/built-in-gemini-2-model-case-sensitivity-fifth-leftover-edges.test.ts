import { describe, expect, it } from "vitest";
import { BuiltInCodeExecutor } from "../../code-executors/built-in-code-executor";
import { LlmRequest } from "../../models/llm-request";

describe("BuiltInCodeExecutor gemini-2 case-sensitivity fifth leftover", () => {
	const executor = new BuiltInCodeExecutor();

	it.each([
		"GEMINI-2.0-flash",
		"Gemini-2.0-flash",
		"GeMiNi-2.5-pro",
		"GEMINI-2",
	])("rejects case-variant %s (startsWith is case-sensitive)", (model) => {
		const req = new LlmRequest({ model });
		expect(() => executor.processLlmRequest(req)).toThrow(
			new RegExp(`not supported for model ${model}`),
		);
	});

	it.each([
		"gemini-2",
		"gemini-2.0-flash",
		"gemini-2.5-pro",
		"gemini-20-flash",
		"gemini-2x",
		"gemini-2.0-FLASH",
	])("accepts lowercase gemini-2 prefix %s (suffix case ignored)", (model) => {
		const req = new LlmRequest({ model });
		expect(() => executor.processLlmRequest(req)).not.toThrow();
		expect(req.config?.tools?.[0]).toEqual({ codeExecution: {} });
	});

	it.each([
		"xgemini-2.0-flash",
		" gemini-2.0-flash",
		"\tgemini-2.0-flash",
		"gemini2.0-flash",
	])("rejects near-miss prefix %s", (model) => {
		const req = new LlmRequest({ model });
		expect(() => executor.processLlmRequest(req)).toThrow(/not supported/);
	});

	it("null model optional-chains to reject", () => {
		const req = new LlmRequest({ model: null as any });
		expect(() => executor.processLlmRequest(req)).toThrow(
			/not supported for model null/,
		);
	});

	it("omitted model rejects with undefined in message", () => {
		const req = new LlmRequest({});
		expect(() => executor.processLlmRequest(req)).toThrow(
			/not supported for model undefined/,
		);
	});
});
