import { type Content, Language, Outcome } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import {
	BaseCodeExecutor,
	type BaseCodeExecutorConfig,
} from "../../code-executors/base-code-executor";
import { BuiltInCodeExecutor } from "../../code-executors/built-in-code-executor";
import {
	CodeExecutionUtils,
	type CodeExecutionInput,
	type CodeExecutionResult,
} from "../../code-executors/code-execution-utils";
import { CodeExecutorContext } from "../../code-executors/code-executor-context";
import { LlmRequest } from "../../models/llm-request";
import { State } from "../../sessions/state";

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

describe("CodeExecutionUtils heavy matrix", () => {
	it.each([
		["print(1)", "print(1)"],
		["", ""],
		["x = 1\ny = 2", "x = 1\ny = 2"],
	])("buildExecutableCodePart stores code %j as PYTHON", (code, expected) => {
		const part = CodeExecutionUtils.buildExecutableCodePart(code);
		expect(part.executableCode?.code).toBe(expected);
		expect(part.executableCode?.language).toBe(Language.PYTHON);
	});

	it.each([
		{ stdout: "", stderr: "err", files: [] as any[], failed: true },
		{ stdout: "ok", stderr: "", files: [] as any[], failed: false },
		{
			stdout: "",
			stderr: "",
			files: [{ name: "a.csv", content: "YQ==", mimeType: "text/csv" }],
			failed: false,
		},
		{
			stdout: "out",
			stderr: "fail",
			files: [{ name: "x", content: "eA==", mimeType: "text/plain" }],
			failed: true,
		},
	])("buildCodeExecutionResultPart matrix %#", ({
		stdout,
		stderr,
		files,
		failed,
	}) => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout,
			stderr,
			outputFiles: files,
		});
		expect(part.codeExecutionResult?.outcome).toBe(
			failed ? Outcome.OUTCOME_FAILED : Outcome.OUTCOME_OK,
		);
		if (failed) {
			expect(part.codeExecutionResult?.output).toBe(stderr);
		}
	});

	it.each([
		{
			delims: [["```", "```"]] as Array<[string, string]>,
			text: "before\n```\nprint(1)\n```\nafter",
			expected: "\nprint(1)\n",
		},
		{
			delims: [["```python", "```"]] as Array<[string, string]>,
			text: "```python\nx=1\n```",
			expected: "\nx=1\n",
		},
		{
			delims: [["[[code]]", "[[/code]]"]] as Array<[string, string]>,
			text: "pre [[code]]body[[/code]] post",
			expected: "body",
		},
	])("extractCodeAndTruncateContent with delimiters $delims", ({
		delims,
		text,
		expected,
	}) => {
		const content: Content = { parts: [{ text }] };
		const code = CodeExecutionUtils.extractCodeAndTruncateContent(
			content,
			delims,
		);
		expect(code).toBe(expected);
	});

	it("returns null for non-matching fence matrix", () => {
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(
				{ parts: [{ text: "no fences" }] },
				[["<<<", ">>>"]],
			),
		).toBeNull();
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(
				{ parts: [{ text: "``````" }] },
				[["```", "```"]],
			),
		).toBeNull();
	});

	it("convertCodeExecutionParts converts trailing executableCode", () => {
		const content: Content = {
			parts: [{ executableCode: { code: "a=1", language: Language.PYTHON } }],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```", "```"],
			["<", ">"],
		);
		expect(content.parts?.[0]?.text).toBe("```a=1```");
	});

	it("convertCodeExecutionParts converts single result and sets role user", () => {
		const content: Content = {
			role: "model",
			parts: [
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "done",
					},
				},
			],
		};
		CodeExecutionUtils.convertCodeExecutionParts(
			content,
			["```", "```"],
			["<<", ">>"],
		);
		expect(content.parts?.[0]?.text).toBe("<<done>>");
		expect(content.role).toBe("user");
	});

	it.each([
		"hello",
		"already-base64-ish!!",
		btoa("x"),
	])("getEncodedFileContent encodes string %j", (value) => {
		const encoded = CodeExecutionUtils.getEncodedFileContent(value);
		expect(typeof encoded).toBe("string");
		if (/^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length % 4 === 0) {
			expect(encoded).toBe(value);
		} else {
			expect(encoded).toBe(btoa(value));
		}
	});

	it("getEncodedFileContent encodes ArrayBuffer", () => {
		const buffer = new TextEncoder().encode("buf").buffer;
		expect(CodeExecutionUtils.getEncodedFileContent(buffer)).toBe(btoa("buf"));
	});

	it("skips executableCode followed by result then extracts fenced text", () => {
		const content: Content = {
			parts: [
				{ executableCode: { code: "skip", language: Language.PYTHON } },
				{
					codeExecutionResult: {
						outcome: Outcome.OUTCOME_OK,
						output: "ran",
					},
				},
				{ text: "```\nprint(9)\n```" },
			],
		};
		expect(
			CodeExecutionUtils.extractCodeAndTruncateContent(content, [
				["```", "```"],
			]),
		).toBe("\nprint(9)\n");
	});

	it("lists multiple artifacts comma-joined", () => {
		const part = CodeExecutionUtils.buildCodeExecutionResultPart({
			stdout: "ok",
			stderr: "",
			outputFiles: [
				{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
				{ name: "b.png", content: "Yg==", mimeType: "image/png" },
			],
		});
		expect(part.codeExecutionResult?.output).toContain("`a.csv`,`b.png`");
	});
});

describe("CodeExecutorContext heavy matrix", () => {
	it("tracks execution id lifecycle", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		expect(context.getExecutionId()).toBeNull();
		context.setExecutionId("e1");
		expect(context.getExecutionId()).toBe("e1");
		context.setExecutionId("e2");
		expect(context.getExecutionId()).toBe("e2");
	});

	it.each([
		[["a.py"], ["a.py"]],
		[
			["a.py", "b.py"],
			["a.py", "b.py"],
		],
		[[], []],
	])("addProcessedFileNames %j", (names, expected) => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		if (names.length) context.addProcessedFileNames(names);
		expect(context.getProcessedFileNames()).toEqual(expected);
	});

	it("increments error counts independently then resets", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.incrementErrorCount("a");
		context.incrementErrorCount("a");
		context.incrementErrorCount("b");
		expect(context.getErrorCount("a")).toBe(2);
		expect(context.getErrorCount("b")).toBe(1);
		context.resetErrorCount("a");
		expect(context.getErrorCount("a")).toBe(0);
		expect(context.getErrorCount("b")).toBe(1);
	});

	it("records multiple code execution results per invocation", () => {
		vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.updateCodeExecutionResult("inv", "a", "1", "");
		context.updateCodeExecutionResult("inv", "b", "", "err");
		expect(state["_code_execution_results"]["inv"]).toHaveLength(2);
		expect(state["_code_execution_results"]["inv"][1]).toMatchObject({
			code: "b",
			resultStderr: "err",
			timestamp: 1_700_000_000,
		});
	});

	it("getStateDelta deep-clones context", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.setExecutionId("clone");
		context.addProcessedFileNames(["x.py"]);
		const delta = context.getStateDelta();
		delta._code_execution_context.execution_session_id = "mut";
		delta._code_execution_context.processed_input_files.push("leak.py");
		expect(context.getExecutionId()).toBe("clone");
		expect(context.getProcessedFileNames()).toEqual(["x.py"]);
	});

	it("reuses preexisting context from state", () => {
		const state = State.create({}, {});
		state["_code_execution_context"] = {
			execution_session_id: "pre",
			processed_input_files: ["seed.py"],
		};
		const context = new CodeExecutorContext(state);
		expect(context.getExecutionId()).toBe("pre");
		expect(context.getProcessedFileNames()).toEqual(["seed.py"]);
	});

	it("addInputFiles accumulates then clearInputFiles empties", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.addInputFiles([
			{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
		]);
		context.addInputFiles([
			{ name: "b.json", content: "e30=", mimeType: "application/json" },
		]);
		expect(context.getInputFiles()).toHaveLength(2);
		context.clearInputFiles();
		expect(context.getInputFiles()).toEqual([]);
	});

	it("shares mutable state across context instances", () => {
		const state = State.create({}, {});
		const first = new CodeExecutorContext(state);
		first.setExecutionId("shared");
		first.incrementErrorCount("inv");
		const second = new CodeExecutorContext(state);
		expect(second.getExecutionId()).toBe("shared");
		expect(second.getErrorCount("inv")).toBe(1);
	});

	it("clearInputFiles is safe when nothing stored", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.clearInputFiles();
		expect(context.getInputFiles()).toEqual([]);
		expect(context.getProcessedFileNames()).toEqual([]);
	});
});

describe("BuiltInCodeExecutor heavy matrix", () => {
	it("exposes defaults", () => {
		const executor = new BuiltInCodeExecutor();
		expect(executor.optimizeDataFile).toBe(false);
		expect(executor.stateful).toBe(false);
		expect(executor.errorRetryAttempts).toBe(2);
	});

	it.each([
		"gemini-2.0-flash",
		"gemini-2.0-pro",
		"gemini-2.5-flash",
		"gemini-2.5-pro",
	])("processLlmRequest accepts %s", (model) => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({ model });
		executor.processLlmRequest(req);
		expect(req.config?.tools?.[0]).toEqual({ codeExecution: {} });
	});

	it.each([
		"gpt-4o",
		"gemini-1.5-flash",
		"claude-3-opus",
		"",
	])("processLlmRequest rejects %j", (model) => {
		const executor = new BuiltInCodeExecutor();
		expect(() => executor.processLlmRequest(new LlmRequest({ model }))).toThrow(
			/not supported for model/,
		);
	});

	it("appends codeExecution tool without wiping existing tools", () => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({ model: "gemini-2.0-flash" });
		req.config = { tools: [{ functionDeclarations: [] } as any] };
		executor.processLlmRequest(req);
		expect(req.config.tools).toHaveLength(2);
		expect(req.config.tools?.[1]).toEqual({ codeExecution: {} });
	});

	it("executeCode throws directly", async () => {
		const executor = new BuiltInCodeExecutor();
		await expect(
			executor.executeCode({} as InvocationContext, { code: "x" } as any),
		).rejects.toThrow(/should not be called directly/);
	});

	it("honors custom config overrides", () => {
		const executor = new BuiltInCodeExecutor({
			optimizeDataFile: true,
			stateful: true,
			errorRetryAttempts: 7,
			codeBlockDelimiters: [["A", "B"]],
			executionResultDelimiters: ["[", "]"],
		});
		expect(executor.optimizeDataFile).toBe(true);
		expect(executor.stateful).toBe(true);
		expect(executor.errorRetryAttempts).toBe(7);
		expect(executor.codeBlockDelimiters).toEqual([["A", "B"]]);
		expect(executor.executionResultDelimiters).toEqual(["[", "]"]);
	});
});

describe("BaseCodeExecutor heavy matrix", () => {
	it("applies default configuration", () => {
		const executor = new StubCodeExecutor();
		expect(executor.optimizeDataFile).toBe(false);
		expect(executor.stateful).toBe(false);
		expect(executor.errorRetryAttempts).toBe(2);
		expect(executor.codeBlockDelimiters.length).toBeGreaterThan(0);
		expect(executor.executionResultDelimiters).toHaveLength(2);
	});

	it.each([
		0, 1, 2, 5, 10,
	])("accepts errorRetryAttempts=%s", (errorRetryAttempts) => {
		const executor = new StubCodeExecutor({ errorRetryAttempts });
		expect(executor.errorRetryAttempts).toBe(errorRetryAttempts);
	});

	it("executeCode stub echoes code and files", async () => {
		const executor = new StubCodeExecutor();
		const result = await executor.executeCode({} as InvocationContext, {
			code: "print('hi')",
			inputFiles: [{ name: "in.csv", content: "YQ==", mimeType: "text/csv" }],
		});
		expect(result.stdout).toBe("print('hi')");
		expect(result.outputFiles[0].name).toBe("in.csv");
	});

	it("treats empty arrays as intentional delimiter overrides", () => {
		const executor = new StubCodeExecutor({
			codeBlockDelimiters: [],
			executionResultDelimiters: ["", ""],
		});
		expect(executor.codeBlockDelimiters).toEqual([]);
		expect(executor.executionResultDelimiters).toEqual(["", ""]);
	});

	it("fills missing optional fields while keeping provided ones", () => {
		const executor = new StubCodeExecutor({ stateful: true });
		expect(executor.stateful).toBe(true);
		expect(executor.optimizeDataFile).toBe(false);
		expect(executor.errorRetryAttempts).toBe(2);
	});

	it("getters return stable delimiter references", () => {
		const delimiters: Array<[string, string]> = [["```", "```"]];
		const executor = new StubCodeExecutor({ codeBlockDelimiters: delimiters });
		expect(executor.codeBlockDelimiters).toBe(delimiters);
		delimiters.push(["'''", "'''"]);
		expect(executor.codeBlockDelimiters).toHaveLength(2);
	});
});
