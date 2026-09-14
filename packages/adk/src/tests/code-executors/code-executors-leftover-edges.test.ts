import { type Content, Language, Outcome } from "@google/genai";
import { describe, expect, it } from "vitest";
import {
	BaseCodeExecutor,
	type BaseCodeExecutorConfig,
} from "../../code-executors/base-code-executor";
import { BuiltInCodeExecutor } from "../../code-executors/built-in-code-executor";
import { CodeExecutionUtils } from "../../code-executors/code-execution-utils";
import { CodeExecutorContext } from "../../code-executors/code-executor-context";
import { ContainerCodeExecutor } from "../../code-executors/container-code-executor";
import { LlmRequest } from "../../models/llm-request";
import { State } from "../../sessions/state";

class TestExecutor extends BaseCodeExecutor {
	constructor(config?: BaseCodeExecutorConfig) {
		super(config);
	}

	async executeCode(): Promise<any> {
		return { stdout: "", stderr: "", outputFiles: [] };
	}
}

function makeState(seed: Record<string, any> = {}): State {
	return State.create(seed, {});
}

describe("CodeExecutorContext leftover edge matrices", () => {
	const invocationIds = ["inv-a", "inv-b", "inv-0", ""];

	for (const id of invocationIds) {
		it(`error count lifecycle for ${JSON.stringify(id)}`, () => {
			const ctx = new CodeExecutorContext(makeState());
			expect(ctx.getErrorCount(id)).toBe(0);
			ctx.incrementErrorCount(id);
			ctx.incrementErrorCount(id);
			expect(ctx.getErrorCount(id)).toBe(2);
			ctx.resetErrorCount(id);
			expect(ctx.getErrorCount(id)).toBe(0);
		});
	}

	it("error counts stay independent across ids", () => {
		const ctx = new CodeExecutorContext(makeState());
		ctx.incrementErrorCount("a");
		ctx.incrementErrorCount("a");
		ctx.incrementErrorCount("b");
		expect(ctx.getErrorCount("a")).toBe(2);
		expect(ctx.getErrorCount("b")).toBe(1);
		ctx.resetErrorCount("a");
		expect(ctx.getErrorCount("a")).toBe(0);
		expect(ctx.getErrorCount("b")).toBe(1);
	});

	const fileBatches = [
		[],
		[{ name: "a.csv", content: "YQ==", mimeType: "text/csv" }],
		[
			{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
			{ name: "b.txt", content: "Yg==", mimeType: "text/plain" },
		],
	];

	for (const [i, files] of fileBatches.entries()) {
		it(`input file batch #${i}`, () => {
			const ctx = new CodeExecutorContext(makeState());
			ctx.addInputFiles(files);
			expect(ctx.getInputFiles()).toEqual(files);
			ctx.clearInputFiles();
			expect(ctx.getInputFiles()).toEqual([]);
		});
	}

	it("processed file names accumulate and clear with input files", () => {
		const ctx = new CodeExecutorContext(makeState());
		expect(ctx.getProcessedFileNames()).toEqual([]);
		ctx.addProcessedFileNames(["a.csv"]);
		ctx.addProcessedFileNames(["b.csv", "c.csv"]);
		expect(ctx.getProcessedFileNames()).toEqual(["a.csv", "b.csv", "c.csv"]);
		ctx.clearInputFiles();
		expect(ctx.getProcessedFileNames()).toEqual([]);
	});

	it("execution id set/get/overwrite", () => {
		const ctx = new CodeExecutorContext(makeState());
		expect(ctx.getExecutionId()).toBeNull();
		ctx.setExecutionId("sess-1");
		expect(ctx.getExecutionId()).toBe("sess-1");
		ctx.setExecutionId("sess-2");
		expect(ctx.getExecutionId()).toBe("sess-2");
	});

	it("updateCodeExecutionResult appends multiple entries", () => {
		const state = makeState();
		const ctx = new CodeExecutorContext(state);
		ctx.updateCodeExecutionResult("i1", "print(1)", "1", "");
		ctx.updateCodeExecutionResult("i1", "print(2)", "", "err");
		const delta = ctx.getStateDelta();
		expect(delta).toHaveProperty("_code_execution_context");
		const results = state["_code_execution_results"].i1;
		expect(results).toHaveLength(2);
		expect(results[0].resultStdout).toBe("1");
		expect(results[1].resultStderr).toBe("err");
		expect(typeof results[0].timestamp).toBe("number");
	});

	it("getStateDelta deep clones nested context", () => {
		const ctx = new CodeExecutorContext(makeState());
		ctx.setExecutionId("x");
		ctx.addProcessedFileNames(["f"]);
		const delta = ctx.getStateDelta();
		delta._code_execution_context.execution_session_id = "mutated";
		delta._code_execution_context.processed_input_files.push("leak");
		expect(ctx.getExecutionId()).toBe("x");
		expect(ctx.getProcessedFileNames()).toEqual(["f"]);
	});

	it("reuses existing context object from session state", () => {
		const state = makeState();
		state["_code_execution_context"] = {
			execution_session_id: "pre",
			processed_input_files: ["p"],
		};
		const ctx = new CodeExecutorContext(state);
		expect(ctx.getExecutionId()).toBe("pre");
		expect(ctx.getProcessedFileNames()).toEqual(["p"]);
	});

	it("resetErrorCount no-ops when map missing or id absent", () => {
		const ctx = new CodeExecutorContext(makeState());
		ctx.resetErrorCount("missing");
		ctx.incrementErrorCount("present");
		ctx.resetErrorCount("other");
		expect(ctx.getErrorCount("present")).toBe(1);
	});
});

describe("CodeExecutionUtils leftover delimiter / result matrices", () => {
	it("returns null for missing content/parts", () => {
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(undefined as any, [
				["```", "```"],
			]),
		).toBeNull();
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent({} as Content, [
				["```", "```"],
			]),
		).toBeNull();
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent({ parts: [] }, [
				["```", "```"],
			]),
		).toBeNull();
	});

	it("skips executableCode when next part is codeExecutionResult", () => {
		const content: Content = {
			parts: [
				{ executableCode: { code: "x=1", language: Language.PYTHON } },
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "ok",
					},
				},
				{ text: "```\ny=2\n```" },
			],
		};
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
			["```", "```"],
		]);
		expect(code).toBe("\ny=2\n");
	});

	const delimiters: Array<[string, string]> = [
		["```", "```"],
		["```python\n", "\n```"],
		["`tool_code\n", "\n`"],
		["<<", ">>"],
	];

	for (const [i, delim] of delimiters.entries()) {
		it(`extracts fenced code with delimiter combo #${i}`, () => {
			const content: Content = {
				parts: [{ text: `pre${delim[0]}print(${i})${delim[1]}post` }],
			};
			const code = CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				delim,
			]);
			expect(code).toBe(`print(${i})`);
			expect(content.parts?.[0]?.text).toBe("pre");
			expect(content.parts?.[1]?.executableCode?.code).toBe(`print(${i})`);
		});
	}

	it("returns null when delimiters present but code empty", () => {
		const content: Content = {
			parts: [{ text: "``````" }],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBeNull();
	});

	it("buildExecutableCodePart always PYTHON", () => {
		for (const code of ["", "x", "print('hi')", "a".repeat(100)]) {
			const part = CodeExecutionUtils.buildExecutableCodePart(code);
			expect(part.executableCode?.language).toBe(Language.PYTHON);
			expect(part.executableCode?.code).toBe(code);
		}
	});

	const resultCases = [
		{
			label: "stderr wins",
			input: { stdout: "out", stderr: "err", outputFiles: [] },
			outcome: Outcome.OUTCOME_FAILED,
			includes: ["err"],
		},
		{
			label: "stdout only",
			input: { stdout: "ok", stderr: "", outputFiles: [] },
			outcome: Outcome.OUTCOME_OK,
			includes: ["Code execution result", "ok"],
		},
		{
			label: "files only",
			input: {
				stdout: "",
				stderr: "",
				outputFiles: [{ name: "a.csv", content: "YQ==", mimeType: "text/csv" }],
			},
			outcome: Outcome.OUTCOME_OK,
			includes: ["Saved artifacts", "`a.csv`"],
		},
		{
			label: "stdout and files",
			input: {
				stdout: "done",
				stderr: "",
				outputFiles: [
					{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
					{ name: "b.png", content: "Yg==", mimeType: "image/png" },
				],
			},
			outcome: Outcome.OUTCOME_OK,
			includes: ["done", "`a.csv`", "`b.png`"],
		},
		{
			label: "empty everything",
			input: { stdout: "", stderr: "", outputFiles: [] },
			outcome: Outcome.OUTCOME_OK,
			includes: ["Code execution result"],
		},
	];

	for (const { label, input, outcome, includes } of resultCases) {
		it(`buildCodeExecutionResultPart ${label}`, () => {
			const part = CodeExecutionUtils.buildCodeExecutionResultPart(input);
			expect(part.codeExecutionResult?.outcome).toBe(outcome);
			for (const s of includes) {
				expect(part.codeExecutionResult?.output).toContain(s);
			}
		});
	}

	it("convertCodeExecutionParts no-ops on empty/missing parts", () => {
		const empty: Content = { parts: [] };
		CodeExecutionUtils.convertCodeExecutionParts(empty, ["`", "`"], ["<", ">"]);
		expect(empty.parts).toEqual([]);
		const bare = {} as Content;
		CodeExecutionUtils.convertCodeExecutionParts(bare, ["`", "`"], ["<", ">"]);
		expect(bare.parts).toBeUndefined();
	});

	it("convertCodeExecutionParts only rewrites trailing result when sole part", () => {
		const multi: Content = {
			parts: [
				{ text: "lead" },
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "x",
					},
				},
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			multi,
			["```", "```"],
			["<", ">"],
		);
		expect(multi.parts?.[1]?.codeExecutionResult?.output).toBe("x");

		const single: Content = {
			parts: [
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "y",
					},
				},
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			single,
			["```", "```"],
			["<", ">"],
		);
		expect(single.parts?.[0]?.text).toBe("<y>");
		expect(single.role).toBe("user");
	});

	const encodeCases = [
		{ label: "plain string", data: "hello", expectB64: true },
		{ label: "already b64", data: btoa("hello"), expectB64: true },
		{
			label: "array buffer",
			data: new TextEncoder().encode("hi").buffer,
			expectB64: true,
		},
	];

	for (const { label, data } of encodeCases) {
		it(`getEncodedFileContent ${label}`, () => {
			const encoded = CodeExecutionUtils.getEncodedFileContent(data as any);
			expect(typeof encoded).toBe("string");
			expect(encoded.length).toBeGreaterThan(0);
			expect(() => atob(encoded)).not.toThrow();
		});
	}
});

describe("BuiltInCodeExecutor leftover config / model matrices", () => {
	const configCombos: BaseCodeExecutorConfig[] = [
		{},
		{ stateful: true },
		{ optimizeDataFile: true },
		{ errorRetryAttempts: 0 },
		{ errorRetryAttempts: 5 },
		{
			stateful: true,
			optimizeDataFile: false,
			errorRetryAttempts: 1,
			codeBlockDelimiters: [["<<", ">>"]],
			executionResultDelimiters: ["[", "]"],
		},
	];

	for (const [i, config] of configCombos.entries()) {
		it(`BuiltInCodeExecutor config combo #${i}`, () => {
			const executor = new BuiltInCodeExecutor(config);
			expect(executor.stateful).toBe(config.stateful ?? false);
			expect(executor.optimizeDataFile).toBe(config.optimizeDataFile ?? false);
			expect(executor.errorRetryAttempts).toBe(config.errorRetryAttempts ?? 2);
			if (config.codeBlockDelimiters) {
				expect(executor.codeBlockDelimiters).toEqual(
					config.codeBlockDelimiters,
				);
			}
			if (config.executionResultDelimiters) {
				expect(executor.executionResultDelimiters).toEqual(
					config.executionResultDelimiters,
				);
			}
		});
	}

	it("executeCode always throws", async () => {
		const executor = new BuiltInCodeExecutor();
		await expect(executor.executeCode({} as any, {} as any)).rejects.toThrow(
			/should not be called directly/,
		);
	});

	const accepted = [
		"gemini-2",
		"gemini-2.0-flash",
		"gemini-2.5-pro",
		"gemini-2-exp",
	];
	for (const model of accepted) {
		it(`accepts model ${model}`, () => {
			const executor = new BuiltInCodeExecutor();
			const req = new LlmRequest({ model });
			executor.processLlmRequest(req);
			expect(req.config?.tools?.some((t: any) => "codeExecution" in t)).toBe(
				true,
			);
		});
	}

	const rejected = [
		"gemini-1.5-pro",
		"gemini-3.0",
		"gpt-4o",
		"",
		undefined as any,
	];
	for (const model of rejected) {
		it(`rejects model ${String(model)}`, () => {
			const executor = new BuiltInCodeExecutor();
			expect(() =>
				executor.processLlmRequest(new LlmRequest({ model })),
			).toThrow(/not supported/);
		});
	}
});

describe("ContainerCodeExecutor leftover constructor rejection matrices", () => {
	it("requires image or dockerPath", () => {
		expect(() => new ContainerCodeExecutor({})).toThrow(
			/Either image or dockerPath/,
		);
	});

	it("rejects stateful true with image", () => {
		expect(
			() => new ContainerCodeExecutor({ image: "img", stateful: true }),
		).toThrow(/stateful=true/);
	});

	it("rejects optimizeDataFile true with image", () => {
		expect(
			() => new ContainerCodeExecutor({ image: "img", optimizeDataFile: true }),
		).toThrow(/optimizeDataFile=true/);
	});

	it("rejects stateful true with dockerPath", () => {
		expect(
			() =>
				new ContainerCodeExecutor({
					dockerPath: "/tmp/docker",
					stateful: true,
				}),
		).toThrow(/stateful=true/);
	});

	it("rejects optimizeDataFile true with dockerPath", () => {
		expect(
			() =>
				new ContainerCodeExecutor({
					dockerPath: "/tmp/docker",
					optimizeDataFile: true,
				}),
		).toThrow(/optimizeDataFile=true/);
	});

	it("BaseCodeExecutor config defaults exposed via TestExecutor", () => {
		const executor = new TestExecutor();
		expect(executor.stateful).toBe(false);
		expect(executor.optimizeDataFile).toBe(false);
		expect(executor.errorRetryAttempts).toBe(2);
		expect(executor.codeBlockDelimiters.length).toBeGreaterThan(0);
		expect(executor.executionResultDelimiters).toHaveLength(2);
	});

	const retryAttempts = [0, 1, 2, 10];
	for (const errorRetryAttempts of retryAttempts) {
		it(`BaseCodeExecutor errorRetryAttempts ${errorRetryAttempts}`, () => {
			expect(new TestExecutor({ errorRetryAttempts }).errorRetryAttempts).toBe(
				errorRetryAttempts,
			);
		});
	}
});
