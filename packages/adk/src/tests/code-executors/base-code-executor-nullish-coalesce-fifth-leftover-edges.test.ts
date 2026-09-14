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

class ProbeCodeExecutor extends BaseCodeExecutor {
	constructor(config: BaseCodeExecutorConfig = {}) {
		super(config);
	}

	async executeCode(
		_invocationContext: InvocationContext,
		_codeExecutionInput: CodeExecutionInput,
	): Promise<CodeExecutionResult> {
		return { stdout: "", stderr: "", outputFiles: [] };
	}
}

describe("BaseCodeExecutor nullish ?? coalesce fifth leftover", () => {
	it.each([
		{ label: "null", errorRetryAttempts: null as any, expected: 2 },
		{ label: "undefined", errorRetryAttempts: undefined, expected: 2 },
		{ label: "0 kept", errorRetryAttempts: 0, expected: 0 },
	])("errorRetryAttempts $label via ??", ({ errorRetryAttempts, expected }) => {
		expect(
			new ProbeCodeExecutor({ errorRetryAttempts }).errorRetryAttempts,
		).toBe(expected);
	});

	it.each([
		{ label: "null optimize", optimizeDataFile: null as any, expected: false },
		{ label: "null stateful", stateful: null as any, expected: false },
		{ label: "false optimize kept", optimizeDataFile: false, expected: false },
		{ label: "false stateful kept", stateful: false, expected: false },
		{ label: "true optimize", optimizeDataFile: true, expected: true },
		{ label: "true stateful", stateful: true, expected: true },
	])("$label boolean ?? matrix", (row) => {
		const executor = new ProbeCodeExecutor({
			optimizeDataFile: (row as any).optimizeDataFile,
			stateful: (row as any).stateful,
		});
		if ("optimizeDataFile" in row && row.optimizeDataFile !== undefined) {
			expect(executor.optimizeDataFile).toBe(row.expected);
		}
		if ("stateful" in row && row.stateful !== undefined) {
			expect(executor.stateful).toBe(row.expected);
		}
	});

	it("empty array codeBlockDelimiters kept via ?? (truthy empty under || would still keep)", () => {
		const executor = new ProbeCodeExecutor({ codeBlockDelimiters: [] });
		expect(executor.codeBlockDelimiters).toEqual([]);
	});

	it("null delimiters fall back to defaults via ??", () => {
		const executor = new ProbeCodeExecutor({
			codeBlockDelimiters: null as any,
			executionResultDelimiters: null as any,
		});
		expect(executor.codeBlockDelimiters).toEqual([
			["`tool_code\n", "\n`"],
			["`python\n", "\n`"],
		]);
		expect(executor.executionResultDelimiters).toEqual([
			"`tool_output\n",
			"\n`",
		]);
	});

	it("documents || would have coalesced 0 retries but ?? keeps 0", () => {
		const withZero = new ProbeCodeExecutor({ errorRetryAttempts: 0 });
		const withNull = new ProbeCodeExecutor({
			errorRetryAttempts: null as any,
		});
		expect(withZero.errorRetryAttempts).toBe(0);
		expect(withNull.errorRetryAttempts).toBe(2);
	});
});
