import { describe, expect, it } from "vitest";
import { BuiltInCodeExecutor } from "../../code-executors/built-in-code-executor";
import { LlmRequest } from "../../models/llm-request";

/**
 * Tenth leftover distinct from tools-nullish ninth: `if (!llmRequest.config)`
 * re-initializes the whole config object for falsy config values.
 */
describe("BuiltInCodeExecutor config falsy reinit tenth leftover", () => {
	it.each([
		null,
		false,
		0,
		"",
		Number.NaN,
	] as const)("config=%j is replaced with a fresh {} then tools are pushed", (falsyConfig) => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({
			model: "gemini-2.0-flash",
			config: falsyConfig as any,
		});
		executor.processLlmRequest(req);
		expect(req.config).not.toBe(falsyConfig);
		expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
	});

	it("truthy empty config object keeps identity and only fills tools", () => {
		const executor = new BuiltInCodeExecutor();
		const config = {} as any;
		const req = new LlmRequest({
			model: "gemini-2.0-flash",
			config,
		});
		executor.processLlmRequest(req);
		expect(req.config).toBe(config);
		expect(config.tools).toEqual([{ codeExecution: {} }]);
	});

	it("truthy config with temperature is preserved when tools missing", () => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({
			model: "gemini-2.5-flash",
			config: { temperature: 0 } as any,
		});
		executor.processLlmRequest(req);
		expect((req.config as any).temperature).toBe(0);
		expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
	});

	it("whitespace model 'gemini-2' with leading space still fails startsWith", () => {
		const executor = new BuiltInCodeExecutor();
		expect(() =>
			executor.processLlmRequest(
				new LlmRequest({
					model: " gemini-2.0-flash",
					config: false as any,
				}),
			),
		).toThrow(/not supported/);
	});
});
