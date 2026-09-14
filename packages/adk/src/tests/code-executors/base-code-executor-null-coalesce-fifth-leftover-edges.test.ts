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
		codeExecutionInput: CodeExecutionInput,
	): Promise<CodeExecutionResult> {
		return {
			stdout: codeExecutionInput.code,
			stderr: "",
			outputFiles: [],
		};
	}
}

describe("BaseCodeExecutor null ?? coalesce fifth leftover (post #165)", () => {
	it.each([
		{
			label: "optimizeDataFile",
			key: "optimizeDataFile" as const,
			expected: false,
		},
		{ label: "stateful", key: "stateful" as const, expected: false },
		{
			label: "errorRetryAttempts",
			key: "errorRetryAttempts" as const,
			expected: 2,
		},
	])("null $label falls through ?? to default (asymmetry vs keeping 0/false)", ({
		key,
		expected,
	}) => {
		const executor = new ProbeCodeExecutor({ [key]: null } as any);
		expect((executor as any)[key]).toBe(expected);
	});

	it("null delimiter bags fall through ?? to built-in defaults", () => {
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

	it("keeps explicit 0 retries and false flags (?? does not treat them as missing)", () => {
		const executor = new ProbeCodeExecutor({
			optimizeDataFile: false,
			stateful: false,
			errorRetryAttempts: 0,
		});
		expect(executor.optimizeDataFile).toBe(false);
		expect(executor.stateful).toBe(false);
		expect(executor.errorRetryAttempts).toBe(0);
	});

	it("keeps empty delimiter arrays via ?? (distinct from null→default)", () => {
		const executor = new ProbeCodeExecutor({
			codeBlockDelimiters: [],
			executionResultDelimiters: ["", ""] as [string, string],
		});
		expect(executor.codeBlockDelimiters).toEqual([]);
		expect(executor.executionResultDelimiters).toEqual(["", ""]);
	});

	it("mixed null + explicit fields only coalesce the nullish ones", () => {
		const executor = new ProbeCodeExecutor({
			optimizeDataFile: true,
			stateful: null as any,
			errorRetryAttempts: null as any,
			codeBlockDelimiters: [["A", "B"]],
			executionResultDelimiters: null as any,
		});
		expect(executor.optimizeDataFile).toBe(true);
		expect(executor.stateful).toBe(false);
		expect(executor.errorRetryAttempts).toBe(2);
		expect(executor.codeBlockDelimiters).toEqual([["A", "B"]]);
		expect(executor.executionResultDelimiters).toEqual([
			"`tool_output\n",
			"\n`",
		]);
	});
});
