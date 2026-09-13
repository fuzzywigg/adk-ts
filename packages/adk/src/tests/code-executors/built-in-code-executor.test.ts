import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { BuiltInCodeExecutor } from "../../code-executors/built-in-code-executor";
import { LlmRequest } from "../../models/llm-request";

describe("BuiltInCodeExecutor", () => {
	it("exposes default getters", () => {
		const executor = new BuiltInCodeExecutor();
		expect(executor.optimizeDataFile).toBe(false);
		expect(executor.stateful).toBe(false);
		expect(executor.errorRetryAttempts).toBe(2);
		expect(executor.codeBlockDelimiters.length).toBeGreaterThan(0);
		expect(executor.executionResultDelimiters).toHaveLength(2);
	});

	it("applies custom config overrides", () => {
		const executor = new BuiltInCodeExecutor({
			optimizeDataFile: true,
			stateful: true,
			errorRetryAttempts: 5,
			codeBlockDelimiters: [["```", "```"]],
			executionResultDelimiters: ["[", "]"],
		});

		expect(executor.optimizeDataFile).toBe(true);
		expect(executor.stateful).toBe(true);
		expect(executor.errorRetryAttempts).toBe(5);
		expect(executor.codeBlockDelimiters).toEqual([["```", "```"]]);
		expect(executor.executionResultDelimiters).toEqual(["[", "]"]);
	});

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

	it("processLlmRequest only accepts gemini-2 models", () => {
		const executor = new BuiltInCodeExecutor();
		const ok = new LlmRequest({ model: "gemini-2.0-flash" });
		executor.processLlmRequest(ok);
		expect(ok.config?.tools).toEqual([{ codeExecution: {} }]);

		const bad = new LlmRequest({ model: "gpt-4o" });
		expect(() => executor.processLlmRequest(bad)).toThrow(
			"Gemini code execution tool is not supported for model gpt-4o",
		);
	});

	it("creates config when missing and appends to existing tools", () => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({ model: "gemini-2.5-pro" });
		expect(req.config).toBeUndefined();
		executor.processLlmRequest(req);
		expect(req.config?.tools).toEqual([{ codeExecution: {} }]);

		req.config!.tools = [{ functionDeclarations: [] } as any];
		executor.processLlmRequest(req);
		expect(req.config?.tools).toHaveLength(2);
		expect(req.config?.tools?.[1]).toEqual({ codeExecution: {} });
	});

	it("rejects undefined/empty models and double-call appends two tools", () => {
		const executor = new BuiltInCodeExecutor();
		expect(() =>
			executor.processLlmRequest(new LlmRequest({ model: undefined })),
		).toThrow(/not supported for model undefined/);
		expect(() =>
			executor.processLlmRequest(new LlmRequest({ model: "" })),
		).toThrow(/not supported for model/);

		const req = new LlmRequest({ model: "gemini-2.0-flash" });
		executor.processLlmRequest(req);
		executor.processLlmRequest(req);
		expect(req.config?.tools).toEqual([
			{ codeExecution: {} },
			{ codeExecution: {} },
		]);
	});
});
