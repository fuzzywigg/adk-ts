import { describe, expect, it } from "vitest";
import { BuiltInCodeExecutor } from "../../code-executors/built-in-code-executor";
import type { LlmRequest } from "../../models";

/**
 * Leftover distinct from #166/#168 gemini-2 prefix/case: processLlmRequest
 * initializes missing config/tools and appends codeExecution without wiping
 * pre-existing tools. executeCode always throws.
 */
describe("BuiltInCodeExecutor sixth leftover: config/tools init append", () => {
	it("creates config and tools when both missing", () => {
		const exec = new BuiltInCodeExecutor();
		const req = { model: "gemini-2.0-flash" } as LlmRequest;
		exec.processLlmRequest(req);
		expect(req.config).toBeDefined();
		expect(req.config?.tools).toHaveLength(1);
		expect(req.config?.tools?.[0]).toEqual({ codeExecution: {} });
	});

	it("creates tools array when config exists without tools", () => {
		const exec = new BuiltInCodeExecutor();
		const req = {
			model: "gemini-2.5-pro",
			config: { temperature: 0.2 },
		} as LlmRequest;
		exec.processLlmRequest(req);
		expect(req.config?.temperature).toBe(0.2);
		expect(req.config?.tools).toHaveLength(1);
	});

	it("appends codeExecution without removing existing tools", () => {
		const exec = new BuiltInCodeExecutor();
		const existing = { googleSearch: {} };
		const req = {
			model: "gemini-2.0-flash",
			config: { tools: [existing] },
		} as LlmRequest;
		exec.processLlmRequest(req);
		expect(req.config?.tools).toHaveLength(2);
		expect(req.config?.tools?.[0]).toBe(existing);
		expect(req.config?.tools?.[1]).toEqual({ codeExecution: {} });
	});

	it("double processLlmRequest appends a second codeExecution tool", () => {
		const exec = new BuiltInCodeExecutor();
		const req = { model: "gemini-2.0-flash", config: {} } as LlmRequest;
		exec.processLlmRequest(req);
		exec.processLlmRequest(req);
		expect(req.config?.tools).toHaveLength(2);
		expect(req.config?.tools?.every((t) => "codeExecution" in t)).toBe(true);
	});

	it("executeCode always rejects with direct-call message", async () => {
		const exec = new BuiltInCodeExecutor();
		await expect(
			exec.executeCode({} as any, {
				code: "print(1)",
				inputFiles: [],
			}),
		).rejects.toThrow(
			"BuiltInCodeExecutor.executeCode should not be called directly",
		);
	});

	it("undefined model fails startsWith and throws unsupported", () => {
		const exec = new BuiltInCodeExecutor();
		expect(() =>
			exec.processLlmRequest({ model: undefined } as LlmRequest),
		).toThrow(/not supported for model undefined/);
	});

	it("empty-string model fails startsWith gemini-2", () => {
		const exec = new BuiltInCodeExecutor();
		expect(() => exec.processLlmRequest({ model: "" } as LlmRequest)).toThrow(
			/not supported for model/,
		);
	});
});
