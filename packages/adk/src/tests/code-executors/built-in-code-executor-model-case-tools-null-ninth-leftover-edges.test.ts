import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { BuiltInCodeExecutor } from "../../code-executors/built-in-code-executor";
import { LlmRequest } from "../../models/llm-request";

describe("BuiltInCodeExecutor model case + tools nullish ninth leftover", () => {
	it.each([
		"Gemini-2.0-flash",
		"GEMINI-2.0-pro",
		"Gemini-2",
		"GEMINI-2",
		"gEmini-2.5-flash",
		" gemini-2.0-flash",
	])("processLlmRequest rejects case/leading-space near-miss %j", (model) => {
		const executor = new BuiltInCodeExecutor();
		expect(() => executor.processLlmRequest(new LlmRequest({ model }))).toThrow(
			/not supported/,
		);
	});

	it.each([
		"gemini-2",
		"gemini-2.0-flash",
		"gemini-2.5-pro",
		"gemini-2.0-flash ",
		"gemini-2!!!",
		"gemini-2/extra",
	])("startsWith('gemini-2') accepts trailing junk %j", (model) => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({ model });
		executor.processLlmRequest(req);
		expect(req.config?.tools?.some((t: any) => "codeExecution" in t)).toBe(
			true,
		);
	});

	it.each([
		null,
		false,
		0,
		"",
		Number.NaN,
	] as const)("config.tools=%j is falsy so tools is re-initialized to [] then push", (falsyTools) => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({
			model: "gemini-2.0-flash",
			config: { temperature: 0.2, tools: falsyTools as any } as any,
		});
		executor.processLlmRequest(req);
		expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
		expect((req.config as any).temperature).toBe(0.2);
	});

	it("config.tools undefined with existing config still initializes tools", () => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({
			model: "gemini-2.0-flash",
			config: { topP: 0.9 } as any,
		});
		executor.processLlmRequest(req);
		expect((req.config as any).topP).toBe(0.9);
		expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
	});

	it("empty tools array is truthy so append pushes without replacing identity", () => {
		const executor = new BuiltInCodeExecutor();
		const tools: any[] = [];
		const req = new LlmRequest({
			model: "gemini-2.0-flash",
			config: { tools } as any,
		});
		executor.processLlmRequest(req);
		expect(req.config?.tools).toBe(tools);
		expect(tools).toEqual([{ codeExecution: {} }]);
	});

	it("double processLlmRequest appends a second codeExecution tool", () => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({ model: "gemini-2.0-flash" });
		executor.processLlmRequest(req);
		executor.processLlmRequest(req);
		expect(req.config?.tools).toEqual([
			{ codeExecution: {} },
			{ codeExecution: {} },
		]);
	});

	it("executeCode always throws even with minimal invocation", async () => {
		const executor = new BuiltInCodeExecutor();
		await expect(
			executor.executeCode({} as InvocationContext, {
				code: "print(1)",
				inputFiles: [],
			}),
		).rejects.toThrow(/should not be called directly/);
	});
});
