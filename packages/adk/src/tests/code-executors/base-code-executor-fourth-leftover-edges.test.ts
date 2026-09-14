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

class MatrixCodeExecutor extends BaseCodeExecutor {
	constructor(config: BaseCodeExecutorConfig = {}) {
		super(config);
	}

	async executeCode(
		_invocationContext: InvocationContext,
		codeExecutionInput: CodeExecutionInput,
	): Promise<CodeExecutionResult> {
		return {
			stdout: codeExecutionInput.code,
			stderr: codeExecutionInput.executionId ?? "",
			outputFiles: codeExecutionInput.inputFiles ?? [],
		};
	}
}

class ExplodingCodeExecutor extends BaseCodeExecutor {
	async executeCode(): Promise<CodeExecutionResult> {
		throw new Error("matrix explode");
	}
}

describe("BaseCodeExecutor fourth leftover coalesce / getter matrices", () => {
	it("empty constructor uses full default bag", () => {
		const executor = new MatrixCodeExecutor();
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

	it("empty object config same as omitted config", () => {
		const a = new MatrixCodeExecutor();
		const b = new MatrixCodeExecutor({});
		expect(a.optimizeDataFile).toBe(b.optimizeDataFile);
		expect(a.stateful).toBe(b.stateful);
		expect(a.errorRetryAttempts).toBe(b.errorRetryAttempts);
		expect(a.codeBlockDelimiters).toEqual(b.codeBlockDelimiters);
		expect(a.executionResultDelimiters).toEqual(b.executionResultDelimiters);
	});

	const boolPairs: Array<[boolean | undefined, boolean | undefined]> = [
		[undefined, undefined],
		[true, undefined],
		[undefined, true],
		[false, false],
		[true, false],
		[false, true],
		[true, true],
	];

	for (const [i, [optimizeDataFile, stateful]] of boolPairs.entries()) {
		it(`boolean coalesce matrix #${i}`, () => {
			const executor = new MatrixCodeExecutor({
				optimizeDataFile,
				stateful,
			});
			expect(executor.optimizeDataFile).toBe(optimizeDataFile ?? false);
			expect(executor.stateful).toBe(stateful ?? false);
		});
	}

	const retryAttempts = [0, 1, 2, 3, 5, 10, 99];
	for (const errorRetryAttempts of retryAttempts) {
		it(`errorRetryAttempts coalesce ${errorRetryAttempts}`, () => {
			expect(
				new MatrixCodeExecutor({ errorRetryAttempts }).errorRetryAttempts,
			).toBe(errorRetryAttempts);
		});
	}

	it("errorRetryAttempts undefined falls back to 2", () => {
		expect(
			new MatrixCodeExecutor({ errorRetryAttempts: undefined })
				.errorRetryAttempts,
		).toBe(2);
	});

	const delimiterOverrides: Array<{
		codeBlockDelimiters?: Array<[string, string]>;
		executionResultDelimiters?: [string, string];
	}> = [
		{ codeBlockDelimiters: [] },
		{ codeBlockDelimiters: [["```", "```"]] },
		{
			codeBlockDelimiters: [
				["A", "B"],
				["C", "D"],
				["E", "F"],
			],
		},
		{ executionResultDelimiters: ["", ""] },
		{ executionResultDelimiters: ["<<", ">>"] },
		{
			codeBlockDelimiters: [["`", "`"]],
			executionResultDelimiters: ["[", "]"],
		},
	];

	for (const [i, partial] of delimiterOverrides.entries()) {
		it(`delimiter coalesce matrix #${i}`, () => {
			const executor = new MatrixCodeExecutor(partial);
			expect(executor.codeBlockDelimiters).toEqual(
				partial.codeBlockDelimiters ?? [
					["`tool_code\n", "\n`"],
					["`python\n", "\n`"],
				],
			);
			expect(executor.executionResultDelimiters).toEqual(
				partial.executionResultDelimiters ?? ["`tool_output\n", "\n`"],
			);
		});
	}

	it("partial override keeps other defaults", () => {
		const executor = new MatrixCodeExecutor({
			stateful: true,
			codeBlockDelimiters: [["X", "Y"]],
		});
		expect(executor.stateful).toBe(true);
		expect(executor.optimizeDataFile).toBe(false);
		expect(executor.errorRetryAttempts).toBe(2);
		expect(executor.codeBlockDelimiters).toEqual([["X", "Y"]]);
		expect(executor.executionResultDelimiters).toEqual([
			"`tool_output\n",
			"\n`",
		]);
	});

	it("full override bag wins every field", () => {
		const executor = new MatrixCodeExecutor({
			optimizeDataFile: true,
			stateful: true,
			errorRetryAttempts: 4,
			codeBlockDelimiters: [["p", "q"]],
			executionResultDelimiters: ["r", "s"],
		});
		expect(executor.optimizeDataFile).toBe(true);
		expect(executor.stateful).toBe(true);
		expect(executor.errorRetryAttempts).toBe(4);
		expect(executor.codeBlockDelimiters).toEqual([["p", "q"]]);
		expect(executor.executionResultDelimiters).toEqual(["r", "s"]);
	});

	it("getters return same array reference as configured", () => {
		const codeBlockDelimiters: Array<[string, string]> = [["```", "```"]];
		const executionResultDelimiters: [string, string] = ["<", ">"];
		const executor = new MatrixCodeExecutor({
			codeBlockDelimiters,
			executionResultDelimiters,
		});
		expect(executor.codeBlockDelimiters).toBe(codeBlockDelimiters);
		expect(executor.executionResultDelimiters).toBe(executionResultDelimiters);
		codeBlockDelimiters.push(["'''", "'''"]);
		expect(executor.codeBlockDelimiters).toHaveLength(2);
	});

	const executeCases: CodeExecutionInput[] = [
		{ code: "", inputFiles: [] },
		{ code: "print(1)", inputFiles: [] },
		{
			code: "x",
			inputFiles: [{ name: "a.csv", content: "YQ==", mimeType: "text/csv" }],
		},
		{
			code: "y",
			inputFiles: [
				{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
				{ name: "b.txt", content: "Yg==", mimeType: "text/plain" },
			],
			executionId: "exec-9",
		},
	];

	for (const [i, input] of executeCases.entries()) {
		it(`executeCode stub echo matrix #${i}`, async () => {
			const executor = new MatrixCodeExecutor();
			const result = await executor.executeCode({} as InvocationContext, input);
			expect(result.stdout).toBe(input.code);
			expect(result.stderr).toBe(input.executionId ?? "");
			expect(result.outputFiles).toEqual(input.inputFiles ?? []);
		});
	}

	it("propagates subclass executeCode failures", async () => {
		const executor = new ExplodingCodeExecutor();
		await expect(
			executor.executeCode({} as InvocationContext, {
				code: "x",
				inputFiles: [],
			}),
		).rejects.toThrow(/matrix explode/);
	});

	it("explicit false/0 are intentional not defaulted away", () => {
		const executor = new MatrixCodeExecutor({
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

	const duckContexts = [
		{},
		{ agent: { name: "a" } },
		{ session: { id: "s" } },
		{ invocationId: "inv" },
	];

	for (const [i, ctx] of duckContexts.entries()) {
		it(`executeCode accepts duck-typed invocation context #${i}`, async () => {
			const executor = new MatrixCodeExecutor();
			const result = await executor.executeCode(ctx as InvocationContext, {
				code: `c${i}`,
				inputFiles: [],
			});
			expect(result.stdout).toBe(`c${i}`);
		});
	}

	it("default delimiters are independent across instances", () => {
		const a = new MatrixCodeExecutor();
		const b = new MatrixCodeExecutor();
		a.codeBlockDelimiters.push(["extra", "extra"]);
		expect(b.codeBlockDelimiters).toHaveLength(2);
	});
});
