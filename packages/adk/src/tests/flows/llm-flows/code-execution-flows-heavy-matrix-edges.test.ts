import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../../agents/llm-agent";
import type { InvocationContext } from "../../../agents/invocation-context";
import { BaseCodeExecutor } from "../../../code-executors/base-code-executor";
import { BuiltInCodeExecutor } from "../../../code-executors/built-in-code-executor";
import { CodeExecutorContext } from "../../../code-executors/code-executor-context";
import {
	DATA_FILE_HELPER_LIB,
	DATA_FILE_UTIL_MAP,
	extractAndReplaceInlineFiles,
	getDataFilePreprocessingCode,
	getOrSetExecutionId,
	hasCodeExecutor,
	postProcessCodeExecutionResult,
	requestProcessor,
	responseProcessor,
} from "../../../flows/llm-flows/code-execution";
import { LlmRequest } from "../../../models/llm-request";
import type { LlmResponse } from "../../../models/llm-response";
import { State } from "../../../sessions/state";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

class StubExecutor extends BaseCodeExecutor {
	executeCode = vi.fn(async () => ({
		stdout: "ok",
		stderr: "",
		outputFiles: [] as Array<{
			name: string;
			content: string;
			mimeType: string;
		}>,
	}));
}

function makeInvocation(
	agent: LlmAgent,
	overrides: Record<string, unknown> = {},
): InvocationContext {
	return {
		agent,
		invocationId: "inv-1",
		appName: "app",
		userId: "u",
		branch: "root",
		session: {
			id: "sess-1",
			appName: "app",
			userId: "u",
			state: {},
			events: [],
		},
		artifactService: { saveArtifact: vi.fn(async () => 1) },
		...overrides,
	} as unknown as InvocationContext;
}

async function collect(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<unknown[]> {
	const items: unknown[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

describe("code-execution flows heavy matrix — requestProcessor", () => {
	it("skips agents without codeExecutor", async () => {
		const llmRequest = new LlmRequest({ model: "gemini-2.0-flash" });
		expect(
			await collect(
				requestProcessor.runAsync(
					{
						agent: { name: "plain" },
						session: { state: {}, events: [] },
					} as unknown as InvocationContext,
					llmRequest,
				),
			),
		).toEqual([]);
		expect(llmRequest.config?.tools).toBeUndefined();
	});

	it("skips duck-typed non-LlmAgent with codeExecutor", async () => {
		const llmRequest = new LlmRequest({ model: "gemini-2.0-flash" });
		expect(
			await collect(
				requestProcessor.runAsync(
					{
						agent: {
							name: "duck",
							codeExecutor: new BuiltInCodeExecutor(),
						},
						session: { state: {}, events: [] },
					} as unknown as InvocationContext,
					llmRequest,
				),
			),
		).toEqual([]);
	});

	it("configures BuiltInCodeExecutor for gemini-2 models", async () => {
		const agent = new LlmAgent({
			name: "coder",
			model: "gemini-2.0-flash",
			codeExecutor: new BuiltInCodeExecutor(),
		});
		const llmRequest = new LlmRequest({ model: "gemini-2.0-flash" });
		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));
		expect(llmRequest.config?.tools).toEqual(
			expect.arrayContaining([expect.objectContaining({ codeExecution: {} })]),
		);
	});

	it("rejects BuiltInCodeExecutor for non-gemini-2 models", async () => {
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: new BuiltInCodeExecutor(),
		});
		await expect(
			collect(
				requestProcessor.runAsync(
					makeInvocation(agent),
					new LlmRequest({ model: "gpt-4o" }),
				),
			),
		).rejects.toThrow(/not supported for model gpt-4o/);
	});

	it("skips csv preprocess when optimizeDataFile is false", async () => {
		const executor = new StubExecutor({ optimizeDataFile: false });
		const agent = new LlmAgent({
			name: "coder",
			model: "gemini-2.0-flash",
			codeExecutor: executor,
		});
		const llmRequest = new LlmRequest({
			model: "gemini-2.0-flash",
			contents: [
				{
					role: "user",
					parts: [
						{
							inlineData: {
								mimeType: "text/csv",
								data: btoa("a,b\n1,2"),
							},
						},
					],
				},
			],
		});
		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));
		expect(executor.executeCode).not.toHaveBeenCalled();
	});

	it("converts trailing executableCode using delimiters", async () => {
		const executor = new StubExecutor({
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```out\n", "\n```"],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gemini-2.0-flash",
			codeExecutor: executor,
		});
		const llmRequest = new LlmRequest({
			model: "gemini-2.0-flash",
			contents: [
				{
					role: "model",
					parts: [
						{
							executableCode: {
								code: "print(1)",
								language: "PYTHON" as any,
							},
						},
					],
				},
			],
		});
		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));
		expect(llmRequest.contents?.[0]?.parts?.[0]?.text).toContain("print(1)");
	});

	it("no-ops when LlmAgent codeExecutor is not BaseCodeExecutor", async () => {
		const agent = new LlmAgent({
			name: "coder",
			model: "gemini-2.0-flash",
			codeExecutor: { kind: "foreign" } as any,
		});
		const llmRequest = new LlmRequest({
			model: "gemini-2.0-flash",
			contents: [
				{
					role: "model",
					parts: [
						{
							executableCode: {
								code: "x=1",
								language: "PYTHON" as any,
							},
						},
					],
				},
			],
		});
		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));
		expect(llmRequest.contents?.[0]?.parts?.[0]?.executableCode?.code).toBe(
			"x=1",
		);
	});

	it("skips LlmAgent when codeExecutor is unset", async () => {
		const agent = new LlmAgent({
			name: "coder",
			model: "gemini-2.0-flash",
		});
		const llmRequest = new LlmRequest({ model: "gemini-2.0-flash" });
		expect(
			await collect(
				requestProcessor.runAsync(makeInvocation(agent), llmRequest),
			),
		).toEqual([]);
	});
});

describe("code-execution flows heavy matrix — responseProcessor", () => {
	it("skips partial responses", async () => {
		expect(
			await collect(
				responseProcessor.runAsync(
					makeInvocation(
						new LlmAgent({
							name: "coder",
							codeExecutor: new BuiltInCodeExecutor(),
						}),
					),
					{
						partial: true,
						content: { role: "model", parts: [{ text: "x" }] },
					} as LlmResponse,
				),
			),
		).toEqual([]);
	});

	it("is a no-op for BuiltInCodeExecutor", async () => {
		expect(
			await collect(
				responseProcessor.runAsync(
					makeInvocation(
						new LlmAgent({
							name: "coder",
							codeExecutor: new BuiltInCodeExecutor(),
						}),
					),
					{
						partial: false,
						content: {
							role: "model",
							parts: [{ text: "```python\nprint(1)\n```" }],
						},
					} as LlmResponse,
				),
			),
		).toEqual([]);
	});

	it("executes extracted code via custom BaseCodeExecutor", async () => {
		const executor = new StubExecutor({
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		executor.executeCode.mockResolvedValue({
			stdout: "42\n",
			stderr: "",
			outputFiles: [],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gemini-2.0-flash",
			codeExecutor: executor,
		});
		const llmResponse = {
			partial: false,
			content: {
				role: "model",
				parts: [{ text: "```python\nprint(42)\n```" }],
			},
		} as LlmResponse;
		const events = await collect(
			responseProcessor.runAsync(makeInvocation(agent), llmResponse),
		);
		expect(executor.executeCode).toHaveBeenCalledOnce();
		expect(events).toHaveLength(2);
		expect(llmResponse.content).toBeUndefined();
	});

	it("skips when errorRetryAttempts are exhausted", async () => {
		const executor = new StubExecutor({ errorRetryAttempts: 0 });
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		ctx.incrementErrorCount("inv-max");
		const events = await collect(
			responseProcessor.runAsync(
				{
					agent: new LlmAgent({
						name: "coder",
						codeExecutor: executor,
					}),
					invocationId: "inv-max",
					session: { state, events: [] },
				} as unknown as InvocationContext,
				{
					partial: false,
					content: {
						role: "model",
						parts: [{ text: "`python\nprint(1)\n`" }],
					},
				} as LlmResponse,
			),
		);
		expect(events).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();
	});

	it("no-ops when content missing", async () => {
		expect(
			await collect(
				responseProcessor.runAsync(
					makeInvocation(
						new LlmAgent({
							name: "coder",
							codeExecutor: new StubExecutor(),
						}),
					),
					{ partial: false } as LlmResponse,
				),
			),
		).toEqual([]);
	});

	it("no-ops when codeExecutor is not BaseCodeExecutor", async () => {
		expect(
			await collect(
				responseProcessor.runAsync(
					makeInvocation(
						new LlmAgent({
							name: "coder",
							codeExecutor: { foreign: true } as any,
						}),
					),
					{
						partial: false,
						content: {
							role: "model",
							parts: [{ text: "```python\nprint(1)\n```" }],
						},
					} as LlmResponse,
				),
			),
		).toEqual([]);
	});

	it("skips agents without a codeExecutor key", async () => {
		expect(
			await collect(
				responseProcessor.runAsync(
					{
						agent: { name: "plain" },
						session: { state: {}, events: [] },
					} as unknown as InvocationContext,
					{
						partial: false,
						content: { role: "model", parts: [{ text: "x" }] },
					} as LlmResponse,
				),
			),
		).toEqual([]);
	});

	it("passes sticky session executionId on stateful response execution", async () => {
		const executor = new StubExecutor({
			stateful: true,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```out\n", "\n```"],
		});
		executor.executeCode.mockResolvedValue({
			stdout: "1",
			stderr: "",
			outputFiles: [],
		});
		const agent = new LlmAgent({
			name: "coder",
			codeExecutor: executor,
		});
		const state = State.create({}, {});
		await collect(
			responseProcessor.runAsync(
				makeInvocation(agent, {
					session: {
						id: "sticky-sess",
						appName: "app",
						userId: "u",
						state,
						events: [],
					},
				}),
				{
					partial: false,
					content: {
						role: "model",
						parts: [{ text: "```python\nprint(1)\n```" }],
					},
				} as LlmResponse,
			),
		);
		expect(executor.executeCode).toHaveBeenCalled();
		const input = executor.executeCode.mock.calls[0][1];
		expect(input.executionId).toBeTruthy();
	});

	it("saves multiple outputFiles and records artifactDelta", async () => {
		const saveArtifact = vi.fn(async () => 1);
		const executor = new StubExecutor({
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```out\n", "\n```"],
		});
		executor.executeCode.mockResolvedValue({
			stdout: "ok",
			stderr: "",
			outputFiles: [
				{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
				{ name: "b.txt", content: "Yg==", mimeType: "text/plain" },
			],
		});
		const agent = new LlmAgent({
			name: "coder",
			codeExecutor: executor,
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeInvocation(agent, { artifactService: { saveArtifact } }),
				{
					partial: false,
					content: {
						role: "model",
						parts: [{ text: "```python\nprint(1)\n```" }],
					},
				} as LlmResponse,
			),
		);
		expect(saveArtifact).toHaveBeenCalledTimes(2);
		expect(events.length).toBeGreaterThanOrEqual(2);
	});
});

describe("code-execution flows heavy matrix — helpers", () => {
	it("hasCodeExecutor detects duck-typed agents", () => {
		expect(hasCodeExecutor(null)).toBeFalsy();
		expect(hasCodeExecutor(undefined)).toBeFalsy();
		expect(hasCodeExecutor({})).toBe(false);
		expect(hasCodeExecutor({ codeExecutor: undefined })).toBe(true);
		expect(hasCodeExecutor("x" as any)).toBeFalsy();
	});

	it("extractAndReplaceInlineFiles swaps csv inline data", () => {
		const state = State.create({}, {});
		const codeCtx = new CodeExecutorContext(state);
		const llmRequest = new LlmRequest({
			contents: [
				{
					role: "user",
					parts: [
						{ inlineData: { mimeType: "text/csv", data: "a,b\n1,2" } },
						{ text: "analyze" },
					],
				},
			],
		});
		const files = extractAndReplaceInlineFiles(codeCtx, llmRequest);
		expect(files).toHaveLength(1);
		expect(files[0].mimeType).toBe("text/csv");
		expect(
			llmRequest.contents?.[0].parts?.some((p: any) =>
				p.text?.includes("analyze"),
			),
		).toBe(true);
	});

	it("getOrSetExecutionId is sticky only for stateful executors", () => {
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		const session = { id: "sess-42", state: {}, events: [] };
		expect(
			getOrSetExecutionId(
				{ agent: { name: "plain" }, session } as unknown as InvocationContext,
				ctx,
			),
		).toBeUndefined();
		expect(
			getOrSetExecutionId(
				{
					agent: { name: "coder", codeExecutor: { stateful: false } },
					session,
				} as unknown as InvocationContext,
				ctx,
			),
		).toBeUndefined();
		const first = getOrSetExecutionId(
			{
				agent: { name: "coder", codeExecutor: { stateful: true } },
				session,
			} as unknown as InvocationContext,
			ctx,
		);
		expect(first).toBe("sess-42");
		expect(
			getOrSetExecutionId(
				{
					agent: { name: "coder", codeExecutor: { stateful: true } },
					session: { id: "other", state: {}, events: [] },
				} as unknown as InvocationContext,
				ctx,
			),
		).toBe("sess-42");
	});

	it.each([
		["text/csv", true],
		["application/json", false],
		["image/png", false],
	])("getDataFilePreprocessingCode mime %s supported=%s", (mime, ok) => {
		const code = getDataFilePreprocessingCode({
			name: "file.csv",
			content: "",
			mimeType: mime,
		});
		if (ok) {
			expect(code).toBeTruthy();
			expect(code).toContain("explore_df");
		} else {
			expect(code).toBeUndefined();
		}
	});

	it("DATA_FILE_UTIL_MAP and DATA_FILE_HELPER_LIB shapes", () => {
		expect(DATA_FILE_UTIL_MAP["text/csv"]).toBeTruthy();
		expect(DATA_FILE_HELPER_LIB).toContain("explore_df");
	});

	it("postProcessCodeExecutionResult requires artifact service", async () => {
		await expect(
			postProcessCodeExecutionResult(
				{
					agent: { name: "coder" },
					invocationId: "inv",
					session: { state: State.create({}, {}), events: [] },
				} as any,
				new CodeExecutorContext(State.create({}, {})),
				{ stdout: "x", stderr: "", outputFiles: [] },
			),
		).rejects.toThrow(/Artifact service/);
	});

	it("postProcessCodeExecutionResult tracks stderr errors", async () => {
		const state = State.create({}, {});
		const codeCtx = new CodeExecutorContext(state);
		const saveArtifact = vi.fn(async () => 1);
		const event = await postProcessCodeExecutionResult(
			{
				agent: { name: "coder" },
				invocationId: "inv-err",
				appName: "app",
				userId: "u",
				branch: "root",
				session: { id: "s", state, events: [] },
				artifactService: { saveArtifact },
			} as any,
			codeCtx,
			{ stdout: "", stderr: "boom", outputFiles: [] },
		);
		expect(event).toBeTruthy();
		expect(codeCtx.getErrorCount("inv-err")).toBeGreaterThan(0);
	});

	it("postProcess resets errors without stderr and saves files", async () => {
		const state = State.create({}, {});
		const codeCtx = new CodeExecutorContext(state);
		codeCtx.incrementErrorCount("inv-ok");
		const saveArtifact = vi.fn(async () => 1);
		await postProcessCodeExecutionResult(
			{
				agent: { name: "coder" },
				invocationId: "inv-ok",
				appName: "app",
				userId: "u",
				branch: "root",
				session: { id: "s", state, events: [] },
				artifactService: { saveArtifact },
			} as any,
			codeCtx,
			{
				stdout: "ok",
				stderr: "",
				outputFiles: [
					{ name: "out.csv", content: "YQ==", mimeType: "text/csv" },
				],
			},
		);
		expect(codeCtx.getErrorCount("inv-ok")).toBe(0);
		expect(saveArtifact).toHaveBeenCalled();
	});

	it("getOrSetExecutionId returns undefined when agent lacks codeExecutor", () => {
		expect(
			getOrSetExecutionId(
				{
					agent: { name: "plain" },
					session: { id: "s", state: {}, events: [] },
				} as any,
				new CodeExecutorContext(State.create({}, {})),
			),
		).toBeUndefined();
	});

	it("extractAndReplaceInlineFiles returns existing when contents undefined", () => {
		const state = State.create({}, {});
		const codeCtx = new CodeExecutorContext(state);
		codeCtx.addInputFiles([
			{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
		]);
		const files = extractAndReplaceInlineFiles(
			codeCtx,
			new LlmRequest({ contents: undefined }),
		);
		expect(files).toHaveLength(1);
	});
});
