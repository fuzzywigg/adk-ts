import { describe, expect, it } from "vitest";
import { BuiltInCodeExecutor } from "../../code-executors/built-in-code-executor";
import { LlmRequest } from "../../models/llm-request";

describe("BuiltInCodeExecutor leftover: startsWith('gemini-2') prefix collisions", () => {
	const executor = new BuiltInCodeExecutor();

	const falsePositives = [
		"gemini-20",
		"gemini-21",
		"gemini-2foo",
		"gemini-200",
		"gemini-2x",
		"gemini-2.anything-that-is-not-real",
		"gemini-2 ",
	];

	for (const model of falsePositives) {
		it(`accepts false-positive prefix collision ${JSON.stringify(model)}`, () => {
			const req = new LlmRequest({ model });
			executor.processLlmRequest(req);
			expect(req.config?.tools?.some((t: any) => "codeExecution" in t)).toBe(
				true,
			);
		});
	}

	const stillRejected = [
		"gemini",
		"gemini-1.5-pro",
		"gemini-3.0-pro",
		"gemini-10",
		"xgemini-2.0-flash",
	];

	for (const model of stillRejected) {
		it(`still rejects non-prefix ${JSON.stringify(model)}`, () => {
			expect(() =>
				executor.processLlmRequest(new LlmRequest({ model })),
			).toThrow(/not supported/);
		});
	}
});
