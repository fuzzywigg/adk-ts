import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { BuiltInCodeExecutor } from "../../code-executors/built-in-code-executor";
import { LlmRequest } from "../../models/llm-request";

describe("BuiltInCodeExecutor edges", () => {
	const executor = new BuiltInCodeExecutor();

	describe("!model?.startsWith('gemini-2')", () => {
		it.each([
			undefined,
			"",
			"gpt-4o",
			"gemini-1.5-flash",
			"gemini-3.0-pro",
			"claude-3-opus",
		])("rejects model %s", (model) => {
			const req = new LlmRequest({ model });
			expect(() => executor.processLlmRequest(req)).toThrow(
				new RegExp(`not supported for model ${model ?? "undefined"}`),
			);
		});

		it.each([
			"gemini-2.0-flash",
			"gemini-2.0-pro",
			"gemini-2.5-flash",
			"gemini-2.5-pro",
			"gemini-2-experimental",
		])("accepts gemini-2 family model %s", (model) => {
			const req = new LlmRequest({ model });
			executor.processLlmRequest(req);
			expect(req.config?.tools?.[0]).toEqual({ codeExecution: {} });
		});
	});

	describe("!config / !tools initialization", () => {
		it("creates config when missing", () => {
			const req = new LlmRequest({ model: "gemini-2.0-flash" });
			expect(req.config).toBeUndefined();
			executor.processLlmRequest(req);
			expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
		});

		it("initializes tools array when config exists without tools", () => {
			const req = new LlmRequest({
				model: "gemini-2.0-flash",
				config: { maxOutputTokens: 128 } as any,
			});
			expect(req.config?.tools).toBeUndefined();
			executor.processLlmRequest(req);
			expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
			expect((req.config as any).maxOutputTokens).toBe(128);
		});

		it("appends code execution tool to existing tools", () => {
			const req = new LlmRequest({ model: "gemini-2.5-pro" });
			executor.processLlmRequest(req);
			req.config!.tools = [{ functionDeclarations: [] } as any];
			executor.processLlmRequest(req);
			expect(req.config?.tools).toHaveLength(2);
			expect(req.config?.tools?.[1]).toEqual({ codeExecution: {} });
		});

		it("preserves unrelated config fields", () => {
			const req = new LlmRequest({
				model: "gemini-2.0-flash",
				config: { temperature: 0.2, topP: 0.9 } as any,
			});
			executor.processLlmRequest(req);
			expect((req.config as any).temperature).toBe(0.2);
			expect((req.config as any).topP).toBe(0.9);
			expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
		});
	});

	describe("executeCode guard", () => {
		it("throws when executeCode is called directly", async () => {
			await expect(
				executor.executeCode({} as InvocationContext, {
					code: "print(1)",
					inputFiles: [],
				}),
			).rejects.toThrow(
				"BuiltInCodeExecutor.executeCode should not be called directly",
			);
		});
	});
});
