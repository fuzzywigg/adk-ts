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
		_codeExecutionInput: CodeExecutionInput,
	): Promise<CodeExecutionResult> {
		return {
			stdout: "",
			stderr: "",
			outputFiles: [],
		};
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
});
