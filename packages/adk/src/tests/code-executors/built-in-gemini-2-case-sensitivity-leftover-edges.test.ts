import { describe, expect, it } from "vitest";
import { BuiltInCodeExecutor } from "../../code-executors/built-in-code-executor";
import { LlmRequest } from "../../models/llm-request";

describe("BuiltInCodeExecutor leftover: case-sensitive startsWith('gemini-2')", () => {
	const executor = new BuiltInCodeExecutor();

	const casedRejects = [
		"Gemini-2.0-flash",
		"GEMINI-2",
		"Gemini-2",
		"GeMiNi-2.5-pro",
		"GEMINI-2.0-FLASH",
		"gEMINI-2.0-flash",
	];

	for (const model of casedRejects) {
		it(`rejects case-mismatched prefix ${JSON.stringify(model)}`, () => {
			expect(() =>
				executor.processLlmRequest(new LlmRequest({ model })),
			).toThrow(/not supported/);
		});
	}

	it("still accepts lowercase prefix even if later segments are mixed-case", () => {
		const req = new LlmRequest({ model: "gemini-2.0-Flash" });
		executor.processLlmRequest(req);
		expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
	});

	it("accepts exact lowercase gemini-2 family", () => {
		const req = new LlmRequest({ model: "gemini-2.0-flash" });
		executor.processLlmRequest(req);
		expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
	});
});
