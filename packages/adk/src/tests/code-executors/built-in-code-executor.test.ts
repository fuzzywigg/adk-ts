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

	it.each([
		"gemini-2.0-flash",
		"gemini-2.0-pro",
		"gemini-2.5-flash",
		"gemini-2.5-pro",
		"gemini-2-experimental",
	])("accepts gemini-2 family model %s", (model) => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({ model });
		executor.processLlmRequest(req);
		expect(req.config?.tools?.[0]).toEqual({ codeExecution: {} });
	});

	it.each([
		"gemini-1.5-flash",
		"gemini-1.5-pro",
		"claude-3-opus",
		"gpt-4.1",
		"gemini",
	])("rejects non-gemini-2 model %s", (model) => {
		const executor = new BuiltInCodeExecutor();
		expect(() => executor.processLlmRequest(new LlmRequest({ model }))).toThrow(
			new RegExp(`not supported for model ${model}`),
		);
	});

	it("preserves unrelated config fields while adding tools", () => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({
			model: "gemini-2.0-flash",
			config: { temperature: 0.2, topP: 0.9 } as any,
		});
		executor.processLlmRequest(req);
		expect((req.config as any).temperature).toBe(0.2);
		expect((req.config as any).topP).toBe(0.9);
		expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
	});

	it("initializes tools when config exists without tools array", () => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({
			model: "gemini-2.0-flash",
			config: { maxOutputTokens: 128 } as any,
		});
		expect(req.config?.tools).toBeUndefined();
		executor.processLlmRequest(req);
		expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
		expect((req.config as any).maxOutputTokens).toBe(128);
	});

	it("does not mutate other requests when processing one", () => {
		const executor = new BuiltInCodeExecutor();
		const a = new LlmRequest({ model: "gemini-2.0-flash" });
		const b = new LlmRequest({ model: "gemini-2.0-flash" });
		executor.processLlmRequest(a);
		expect(b.config).toBeUndefined();
		executor.processLlmRequest(b);
		expect(a.config?.tools).toHaveLength(1);
		expect(b.config?.tools).toHaveLength(1);
	});

	it("rejects case-sensitive non-gemini-2 prefix", () => {
		const executor = new BuiltInCodeExecutor();
		expect(() =>
			executor.processLlmRequest(new LlmRequest({ model: "Gemini-2.0-flash" })),
		).toThrow(/not supported for model Gemini-2.0-flash/);
	});

	it("pushes onto an existing empty tools array", () => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({
			model: "gemini-2.5-pro",
			config: { tools: [] } as any,
		});
		executor.processLlmRequest(req);
		expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
	});

	it("executeCode rejects with exact message regardless of invocation context", async () => {
		const executor = new BuiltInCodeExecutor();
		await expect(
			executor.executeCode({ agent: { name: "x" } } as any, {
				code: "print(1)",
				inputFiles: [],
			}),
		).rejects.toThrow(
			"BuiltInCodeExecutor.executeCode should not be called directly",
		);
	});

	it("accepts gemini-2 models including flash-lite variants", () => {
		const executor = new BuiltInCodeExecutor();
		for (const model of [
			"gemini-2.0-flash-lite",
			"gemini-2.5-flash",
			"gemini-2",
		]) {
			const req = new LlmRequest({ model });
			executor.processLlmRequest(req);
			expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
		}
	});
});
