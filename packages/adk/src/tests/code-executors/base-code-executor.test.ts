import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import {
	BaseCodeExecutor,
	type BaseCodeExecutorConfig,
} from "../../code-executors/base-code-executor";
import type {
	CodeExecutionInput,
	CodeExecutionResult,
} from "../../code-executors/code-execution-utils";

class StubCodeExecutor extends BaseCodeExecutor {
	constructor(config: BaseCodeExecutorConfig = {}) {
		super(config);
	}

	async executeCode(
		_invocationContext: InvocationContext,
		codeExecutionInput: CodeExecutionInput,
	): Promise<CodeExecutionResult> {
		return {
			stdout: codeExecutionInput.code,
			stderr: "",
			outputFiles: codeExecutionInput.inputFiles ?? [],
		};
	}
}

class ThrowingCodeExecutor extends BaseCodeExecutor {
	async executeCode(): Promise<CodeExecutionResult> {
		throw new Error("stub explode");
	}
}

describe("BaseCodeExecutor", () => {
	it("applies default configuration values", () => {
		const executor = new StubCodeExecutor();

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

	it("honors configuration overrides", () => {
		const executor = new StubCodeExecutor({
			optimizeDataFile: true,
			stateful: true,
			errorRetryAttempts: 5,
			codeBlockDelimiters: [["```ts\n", "\n```"]],
			executionResultDelimiters: ["<<", ">>"],
		});

		expect(executor.optimizeDataFile).toBe(true);
		expect(executor.stateful).toBe(true);
		expect(executor.errorRetryAttempts).toBe(5);
		expect(executor.codeBlockDelimiters).toEqual([["```ts\n", "\n```"]]);
		expect(executor.executionResultDelimiters).toEqual(["<<", ">>"]);
	});

	it("treats explicit false/0 overrides as intentional values", () => {
		const executor = new StubCodeExecutor({
			optimizeDataFile: false,
			stateful: false,
			errorRetryAttempts: 0,
			codeBlockDelimiters: [],
			executionResultDelimiters: ["", ""],
		});
		expect(executor.optimizeDataFile).toBe(false);
		expect(executor.stateful).toBe(false);
		expect(executor.errorRetryAttempts).toBe(0);
		expect(executor.codeBlockDelimiters).toEqual([]);
		expect(executor.executionResultDelimiters).toEqual(["", ""]);
	});

	it("fills missing optional fields while keeping provided ones", () => {
		const executor = new StubCodeExecutor({
			stateful: true,
			codeBlockDelimiters: [["A", "B"]],
		});
		expect(executor.stateful).toBe(true);
		expect(executor.optimizeDataFile).toBe(false);
		expect(executor.errorRetryAttempts).toBe(2);
		expect(executor.codeBlockDelimiters).toEqual([["A", "B"]]);
		expect(executor.executionResultDelimiters).toEqual([
			"`tool_output\n",
			"\n`",
		]);
	});

	it("executeCode stub echoes code and forwards input files", async () => {
		const executor = new StubCodeExecutor();
		const result = await executor.executeCode({} as InvocationContext, {
			code: "print('hi')",
			inputFiles: [{ name: "in.csv", content: "YQ==", mimeType: "text/csv" }],
			executionId: "exec-1",
		});
		expect(result.stdout).toBe("print('hi')");
		expect(result.outputFiles).toHaveLength(1);
		expect(result.outputFiles[0].name).toBe("in.csv");
	});

	it("propagates executeCode failures from subclasses", async () => {
		const executor = new ThrowingCodeExecutor();
		await expect(
			executor.executeCode({} as InvocationContext, {
				code: "x",
				inputFiles: [],
			}),
		).rejects.toThrow(/stub explode/);
	});

	it("getters return stable references for delimiter arrays", () => {
		const delimiters: Array<[string, string]> = [["```", "```"]];
		const executor = new StubCodeExecutor({
			codeBlockDelimiters: delimiters,
			executionResultDelimiters: ["[", "]"],
		});
		expect(executor.codeBlockDelimiters).toBe(delimiters);
		delimiters.push(["'''", "'''"]);
		expect(executor.codeBlockDelimiters).toHaveLength(2);
	});

	it.each([
		1, 2, 3, 10,
	])("accepts errorRetryAttempts=%s", (errorRetryAttempts) => {
		const executor = new StubCodeExecutor({ errorRetryAttempts });
		expect(executor.errorRetryAttempts).toBe(errorRetryAttempts);
	});
});
