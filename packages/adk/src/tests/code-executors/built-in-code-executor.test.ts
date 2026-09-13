import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { BuiltInCodeExecutor } from "../../code-executors/built-in-code-executor";
import { LlmRequest } from "../../models/llm-request";

describe("BuiltInCodeExecutor", () => {
	it("throws when executeCode is called directly", async () => {
		const executor = new BuiltInCodeExecutor();

		await expect(
			executor.executeCode(
				{} as InvocationContext,
				{
					code: "print(1)",
				} as any,
			),
		).rejects.toThrow(
			"BuiltInCodeExecutor.executeCode should not be called directly",
		);
	});

	it("throws processLlmRequest for non-gemini-2 models", () => {
		const executor = new BuiltInCodeExecutor();
		const request = new LlmRequest({ model: "gpt-4o" });

		expect(() => executor.processLlmRequest(request)).toThrow(
			"Gemini code execution tool is not supported for model gpt-4o",
		);
	});

	it("adds codeExecution tool for gemini-2.0-flash", () => {
		const executor = new BuiltInCodeExecutor();
		const request = new LlmRequest({ model: "gemini-2.0-flash" });

		executor.processLlmRequest(request);

		expect(request.config?.tools).toEqual([{ codeExecution: {} }]);
	});

	it("exposes BaseCodeExecutor config defaults via getters", () => {
		const executor = new BuiltInCodeExecutor();

		expect(executor.optimizeDataFile).toBe(false);
		expect(executor.stateful).toBe(false);
		expect(executor.errorRetryAttempts).toBe(2);
		expect(executor.codeBlockDelimiters).toEqual([
			["`tool_code\n", "\n`"],
			["`python\n", "\n`"],
		]);
		expect(executor.executionResultDelimiters).toEqual([
			"`tool_output\n",
			"\n`",
		]);
	});
});
