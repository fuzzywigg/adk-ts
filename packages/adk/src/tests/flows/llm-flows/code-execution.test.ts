import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../../agents/llm-agent";
import type { InvocationContext } from "../../../agents/invocation-context";
import { BaseCodeExecutor } from "../../../code-executors/base-code-executor";
import { BuiltInCodeExecutor } from "../../../code-executors/built-in-code-executor";
import { CodeExecutorContext } from "../../../code-executors/code-executor-context";
import {
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

async function collect(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<unknown[]> {
	const items: unknown[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

describe("code-execution processors", () => {
	it("requestProcessor skips agents without codeExecutor", async () => {
		const llmRequest = new LlmRequest({ model: "gemini-2.0-flash" });
		const events = await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "plain" },
					session: { state: {}, events: [] },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(events).toEqual([]);
		expect(llmRequest.config?.tools).toBeUndefined();
	});

	it("requestProcessor skips duck-typed agents that are not LlmAgent", async () => {
		const llmRequest = new LlmRequest({ model: "gemini-2.0-flash" });
		const events = await collect(
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
		);
		expect(events).toEqual([]);
		expect(llmRequest.config?.tools).toBeUndefined();
	});

	it("requestProcessor configures BuiltInCodeExecutor for gemini-2 models", async () => {
		const agent = new LlmAgent({
			name: "coder",
			model: "gemini-2.0-flash",
			codeExecutor: new BuiltInCodeExecutor(),
		});
		const llmRequest = new LlmRequest({ model: "gemini-2.0-flash" });

		const events = await collect(
			requestProcessor.runAsync(
				{
					agent,
					session: { state: {}, events: [], id: "s1" },
					invocationId: "inv-1",
				} as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(events).toEqual([]);
		expect(llmRequest.config?.tools).toEqual(
			expect.arrayContaining([expect.objectContaining({ codeExecution: {} })]),
		);
	});

	it("requestProcessor rejects BuiltInCodeExecutor for non-gemini-2 models", async () => {
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: new BuiltInCodeExecutor(),
		});
		const llmRequest = new LlmRequest({ model: "gpt-4o" });

		await expect(
			collect(
				requestProcessor.runAsync(
					{
						agent,
						session: { state: {}, events: [], id: "s1" },
						invocationId: "inv-1",
					} as unknown as InvocationContext,
					llmRequest,
				),
			),
		).rejects.toThrow(/not supported for model gpt-4o/);
	});

	it("responseProcessor skips partial responses", async () => {
		const events = await collect(
			responseProcessor.runAsync(
				{
					agent: new LlmAgent({
						name: "coder",
						codeExecutor: new BuiltInCodeExecutor(),
					}),
					session: { state: {}, events: [] },
				} as unknown as InvocationContext,
				{
					partial: true,
					content: { role: "model", parts: [{ text: "x" }] },
				} as LlmResponse,
			),
		);
		expect(events).toEqual([]);
	});

	it("responseProcessor is a no-op for BuiltInCodeExecutor", async () => {
		const events = await collect(
			responseProcessor.runAsync(
				{
					agent: new LlmAgent({
						name: "coder",
						codeExecutor: new BuiltInCodeExecutor(),
					}),
					session: { state: {}, events: [] },
				} as unknown as InvocationContext,
				{
					partial: false,
					content: {
						role: "model",
						parts: [{ text: "```python\nprint(1)\n```" }],
					},
				} as LlmResponse,
			),
		);
		expect(events).toEqual([]);
	});

	it("responseProcessor executes extracted code via custom BaseCodeExecutor", async () => {
		class StubExecutor extends BaseCodeExecutor {
			executeCode = vi.fn(async () => ({
				stdout: "42\n",
				stderr: "",
				outputFiles: [],
			}));
		}
		const executor = new StubExecutor({
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gemini-2.0-flash",
			codeExecutor: executor,
		});
		const saveArtifact = vi.fn(async () => 1);
		const llmResponse = {
			partial: false,
			content: {
				role: "model",
				parts: [{ text: "```python\nprint(42)\n```" }],
			},
		} as LlmResponse;

		const events = await collect(
			responseProcessor.runAsync(
				{
					agent,
					branch: "root",
					invocationId: "inv-code",
					appName: "app",
					userId: "u",
					session: {
						id: "s1",
						appName: "app",
						userId: "u",
						state: {},
						events: [],
					},
					artifactService: { saveArtifact },
				} as unknown as InvocationContext,
				llmResponse,
			),
		);

		expect(executor.executeCode).toHaveBeenCalledOnce();
		expect(events).toHaveLength(2);
		expect(
			(events[0] as any).content?.parts?.some(
				(p: any) =>
					p.executableCode?.code?.includes("print(42)") ||
					p.text?.includes("print(42)"),
			),
		).toBe(true);
		expect((events[1] as any).author).toBe("coder");
		expect(llmResponse.content).toBeUndefined();
	});

	it("responseProcessor skips when errorRetryAttempts are exhausted", async () => {
		class StubExecutor extends BaseCodeExecutor {
			executeCode = vi.fn(async () => ({
				stdout: "",
				stderr: "",
				outputFiles: [],
			}));
		}
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

	it("requestProcessor yields preprocessing events for unprocessed csv inputs", async () => {
		class StubExecutor extends BaseCodeExecutor {
			executeCode = vi.fn(async () => ({
				stdout: "loaded",
				stderr: "",
				outputFiles: [],
			}));
		}
		const executor = new StubExecutor({
			optimizeDataFile: true,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const llmRequest = new LlmRequest({
			model: "gpt-4o",
			contents: [
				{
					role: "user",
					parts: [
						{ text: "analyze" },
						{ inlineData: { mimeType: "text/csv", data: "a,b\n1,2" } },
					],
				},
			],
		});
		const saveArtifact = vi.fn(async () => 1);

		const events = await collect(
			requestProcessor.runAsync(
				{
					agent,
					invocationId: "inv-csv",
					appName: "app",
					userId: "u",
					branch: "root",
					session: {
						id: "s1",
						appName: "app",
						userId: "u",
						state: {},
						events: [],
					},
					artifactService: { saveArtifact },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(executor.executeCode).toHaveBeenCalled();
		expect(events.length).toBeGreaterThanOrEqual(2);
		expect((events[0] as any).content?.parts?.[0]?.text).toContain(
			"Processing input file",
		);
	});

	it("requestProcessor skips csv preprocess when optimizeDataFile is false", async () => {
		class StubExecutor extends BaseCodeExecutor {
			executeCode = vi.fn(async () => ({
				stdout: "",
				stderr: "",
				outputFiles: [],
			}));
		}
		const executor = new StubExecutor({ optimizeDataFile: false });
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const llmRequest = new LlmRequest({
			model: "gpt-4o",
			contents: [
				{
					role: "user",
					parts: [
						{ text: "analyze" },
						{ inlineData: { mimeType: "text/csv", data: "a,b\n1,2" } },
					],
				},
			],
		});

		const events = await collect(
			requestProcessor.runAsync(
				{
					agent,
					invocationId: "inv-skip-opt",
					session: { id: "s1", state: {}, events: [] },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(events).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();
	});

	it("requestProcessor does not re-execute already processed csv files", async () => {
		class StubExecutor extends BaseCodeExecutor {
			executeCode = vi.fn(async () => ({
				stdout: "loaded",
				stderr: "",
				outputFiles: [],
			}));
		}
		const executor = new StubExecutor({
			optimizeDataFile: true,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const llmRequest = new LlmRequest({
			model: "gpt-4o",
			contents: [
				{
					role: "user",
					parts: [
						{ text: "analyze" },
						{ inlineData: { mimeType: "text/csv", data: "a,b\n1,2" } },
					],
				},
			],
		});
		const invocation = {
			agent,
			invocationId: "inv-csv-once",
			appName: "app",
			userId: "u",
			branch: "root",
			session: {
				id: "s1",
				appName: "app",
				userId: "u",
				state: {},
				events: [],
			},
			artifactService: { saveArtifact: vi.fn(async () => 1) },
		} as unknown as InvocationContext;

		await collect(requestProcessor.runAsync(invocation, llmRequest));
		const firstCalls = executor.executeCode.mock.calls.length;
		expect(firstCalls).toBeGreaterThan(0);

		await collect(requestProcessor.runAsync(invocation, llmRequest));
		expect(executor.executeCode).toHaveBeenCalledTimes(firstCalls);
	});

	it("responseProcessor is a no-op when model response has no extractable code", async () => {
		class StubExecutor extends BaseCodeExecutor {
			executeCode = vi.fn(async () => ({
				stdout: "",
				stderr: "",
				outputFiles: [],
			}));
		}
		const executor = new StubExecutor({
			codeBlockDelimiters: [["```python\n", "\n```"]],
		});
		const llmResponse = {
			partial: false,
			content: {
				role: "model",
				parts: [{ text: "no code here" }],
			},
		} as LlmResponse;

		const events = await collect(
			responseProcessor.runAsync(
				{
					agent: new LlmAgent({
						name: "coder",
						codeExecutor: executor,
					}),
					session: { state: {}, events: [] },
				} as unknown as InvocationContext,
				llmResponse,
			),
		);

		expect(events).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();
		expect(llmResponse.content).toBeDefined();
	});
});

describe("code-execution helpers", () => {
	it("hasCodeExecutor detects duck-typed agents", () => {
		expect(hasCodeExecutor(null)).toBeFalsy();
		expect(hasCodeExecutor({})).toBe(false);
		expect(hasCodeExecutor({ codeExecutor: undefined })).toBe(true);
	});

	it("extractAndReplaceInlineFiles swaps csv inline data for placeholders", () => {
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		const llmRequest = new LlmRequest({
			contents: [
				{
					role: "model",
					parts: [{ inlineData: { mimeType: "text/csv", data: "a,b\n1,2" } }],
				},
				{
					role: "user",
					parts: [
						{ text: "analyze" },
						{ inlineData: { mimeType: "text/csv", data: "x,y\n3,4" } },
						{ inlineData: { mimeType: "image/png", data: "ignore" } },
					],
				},
			],
		});

		const files = extractAndReplaceInlineFiles(ctx, llmRequest);

		expect(DATA_FILE_UTIL_MAP["text/csv"].extension).toBe(".csv");
		expect(files).toHaveLength(1);
		expect(files[0].name).toBe("data_2_2.csv");
		expect(files[0].mimeType).toBe("text/csv");
		expect(llmRequest.contents?.[1].parts?.[1]).toEqual({
			text: "\nAvailable file: `data_2_2.csv`\n",
		});
		expect(llmRequest.contents?.[1].parts?.[2]?.inlineData?.mimeType).toBe(
			"image/png",
		);
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
					agent: {
						name: "coder",
						codeExecutor: { stateful: false },
					},
					session,
				} as unknown as InvocationContext,
				ctx,
			),
		).toBeUndefined();

		const first = getOrSetExecutionId(
			{
				agent: {
					name: "coder",
					codeExecutor: { stateful: true },
				},
				session,
			} as unknown as InvocationContext,
			ctx,
		);
		expect(first).toBe("sess-42");
		expect(ctx.getExecutionId()).toBe("sess-42");

		const second = getOrSetExecutionId(
			{
				agent: {
					name: "coder",
					codeExecutor: { stateful: true },
				},
				session: { id: "other", state: {}, events: [] },
			} as unknown as InvocationContext,
			ctx,
		);
		expect(second).toBe("sess-42");
	});

	it("getDataFilePreprocessingCode normalizes names and rejects unknown mime", () => {
		expect(
			getDataFilePreprocessingCode({
				name: "report.pdf",
				content: "",
				mimeType: "application/pdf",
			}),
		).toBeUndefined();

		const code = getDataFilePreprocessingCode({
			name: "1-sales data.csv",
			content: "",
			mimeType: "text/csv",
		});
		expect(code).toContain("_1_sales_data = pd.read_csv('1-sales data.csv')");
		expect(code).toContain("explore_df(_1_sales_data)");
	});

	it("postProcessCodeExecutionResult requires artifact service and tracks errors", async () => {
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);

		await expect(
			postProcessCodeExecutionResult(
				{
					agent: { name: "coder" },
					session: {
						id: "s1",
						appName: "app",
						userId: "u",
						state: {},
						events: [],
					},
					invocationId: "inv-1",
					appName: "app",
					userId: "u",
				} as unknown as InvocationContext,
				ctx,
				{ stdout: "ok", stderr: "", outputFiles: [] },
			),
		).rejects.toThrow(/Artifact service is not initialized/);

		const saveArtifact = vi.fn(async () => 3);
		const withStderr = await postProcessCodeExecutionResult(
			{
				agent: { name: "coder" },
				branch: "root",
				session: {
					id: "s1",
					appName: "app",
					userId: "u",
					state: {},
					events: [],
				},
				invocationId: "inv-err",
				appName: "app",
				userId: "u",
				artifactService: { saveArtifact },
			} as unknown as InvocationContext,
			ctx,
			{
				stdout: "",
				stderr: "Traceback",
				outputFiles: [
					{ name: "out.txt", content: btoa("hello"), mimeType: "text/plain" },
				],
			},
		);

		expect(ctx.getErrorCount("inv-err")).toBe(1);
		expect(saveArtifact).toHaveBeenCalledOnce();
		expect(withStderr.actions.artifactDelta["out.txt"]).toBe(3);
		expect(withStderr.author).toBe("coder");

		await postProcessCodeExecutionResult(
			{
				agent: { name: "coder" },
				session: {
					id: "s1",
					appName: "app",
					userId: "u",
					state: {},
					events: [],
				},
				invocationId: "inv-err",
				appName: "app",
				userId: "u",
				artifactService: { saveArtifact },
			} as unknown as InvocationContext,
			ctx,
			{ stdout: "ok", stderr: "", outputFiles: [] },
		);
		expect(ctx.getErrorCount("inv-err")).toBe(0);
	});

	it("requestProcessor no-ops convert when LlmAgent codeExecutor is not BaseCodeExecutor", async () => {
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: { optimizeDataFile: true } as any,
		});
		const llmRequest = new LlmRequest({
			model: "gpt-4o",
			contents: [
				{
					role: "user",
					parts: [
						{ text: "keep me" },
						{ executableCode: { code: "print(1)" } },
					],
				},
			],
		});
		const before = structuredClone(llmRequest.contents);
		const events = await collect(
			requestProcessor.runAsync(
				{
					agent,
					invocationId: "inv-duck-exec",
					session: { id: "s1", state: {}, events: [] },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(events).toEqual([]);
		expect(llmRequest.contents).toEqual(before);
	});

	it("requestProcessor skips csv preprocess when errorRetryAttempts are exhausted", async () => {
		class StubExecutor extends BaseCodeExecutor {
			executeCode = vi.fn(async () => ({
				stdout: "",
				stderr: "",
				outputFiles: [],
			}));
		}
		const executor = new StubExecutor({
			optimizeDataFile: true,
			errorRetryAttempts: 0,
		});
		const state = State.create({}, {});
		const cex = new CodeExecutorContext(state);
		cex.incrementErrorCount("inv-pre-max");
		const llmRequest = new LlmRequest({
			model: "gpt-4o",
			contents: [
				{
					role: "user",
					parts: [
						{ text: "analyze" },
						{ inlineData: { mimeType: "text/csv", data: "a,b\n1,2" } },
					],
				},
			],
		});

		const events = await collect(
			requestProcessor.runAsync(
				{
					agent: new LlmAgent({
						name: "coder",
						model: "gpt-4o",
						codeExecutor: executor,
					}),
					invocationId: "inv-pre-max",
					session: { id: "s1", state, events: [] },
					artifactService: { saveArtifact: vi.fn(async () => 1) },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(events).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();
	});

	it("requestProcessor skips preprocessing code for unsupported pre-seeded input files", async () => {
		class StubExecutor extends BaseCodeExecutor {
			executeCode = vi.fn(async () => ({
				stdout: "ok",
				stderr: "",
				outputFiles: [],
			}));
		}
		const executor = new StubExecutor({
			optimizeDataFile: true,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const state = State.create({}, {});
		const cex = new CodeExecutorContext(state);
		cex.addInputFiles([
			{ name: "notes.pdf", content: "", mimeType: "application/pdf" },
			{ name: "data.csv", content: "a,b\n1,2", mimeType: "text/csv" },
		]);
		const llmRequest = new LlmRequest({
			model: "gpt-4o",
			contents: [{ role: "user", parts: [{ text: "go" }] }],
		});

		await collect(
			requestProcessor.runAsync(
				{
					agent: new LlmAgent({
						name: "coder",
						model: "gpt-4o",
						codeExecutor: executor,
					}),
					invocationId: "inv-mixed-files",
					appName: "app",
					userId: "u",
					session: { id: "s1", state, events: [] },
					artifactService: { saveArtifact: vi.fn(async () => 1) },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(executor.executeCode).toHaveBeenCalledTimes(1);
		expect(executor.executeCode.mock.calls[0][1].code).toContain(
			"pd.read_csv('data.csv')",
		);
		expect(cex.getProcessedFileNames()).toContain("data.csv");
		expect(cex.getProcessedFileNames()).not.toContain("notes.pdf");
	});

	it("responseProcessor no-ops when codeExecutor is not BaseCodeExecutor", async () => {
		const events = await collect(
			responseProcessor.runAsync(
				{
					agent: {
						name: "coder",
						codeExecutor: { fake: true },
					},
					session: { state: {}, events: [] },
				} as unknown as InvocationContext,
				{
					partial: false,
					content: {
						role: "model",
						parts: [{ text: "```python\nprint(1)\n```" }],
					},
				} as LlmResponse,
			),
		);
		expect(events).toEqual([]);
	});

	it("responseProcessor no-ops for missing content", async () => {
		class StubExecutor extends BaseCodeExecutor {
			executeCode = vi.fn(async () => ({
				stdout: "",
				stderr: "",
				outputFiles: [],
			}));
		}
		const executor = new StubExecutor();
		const agent = new LlmAgent({
			name: "coder",
			codeExecutor: executor,
		});

		expect(
			await collect(
				responseProcessor.runAsync(
					{
						agent,
						session: { state: {}, events: [] },
					} as unknown as InvocationContext,
					{ partial: false } as LlmResponse,
				),
			),
		).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();
	});

	it("requestProcessor converts executableCode parts using codeBlockDelimiters", async () => {
		class StubExecutor extends BaseCodeExecutor {
			executeCode = vi.fn(async () => ({
				stdout: "",
				stderr: "",
				outputFiles: [],
			}));
		}
		const executor = new StubExecutor({
			optimizeDataFile: false,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const llmRequest = new LlmRequest({
			model: "gpt-4o",
			contents: [
				{
					role: "model",
					parts: [
						{
							executableCode: { language: "PYTHON", code: "print('hi')" },
						},
					],
				},
			],
		});

		await collect(
			requestProcessor.runAsync(
				{
					agent: new LlmAgent({
						name: "coder",
						model: "gpt-4o",
						codeExecutor: executor,
					}),
					session: { id: "s1", state: {}, events: [] },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.contents?.[0].parts?.[0].text).toContain("```python");
		expect(llmRequest.contents?.[0].parts?.[0].text).toContain("print('hi')");
		expect(llmRequest.contents?.[0].parts?.[0].executableCode).toBeUndefined();
	});

	it("requestProcessor converts single-part codeExecutionResult and sets role user", async () => {
		class StubExecutor extends BaseCodeExecutor {
			executeCode = vi.fn(async () => ({
				stdout: "",
				stderr: "",
				outputFiles: [],
			}));
		}
		const executor = new StubExecutor({
			optimizeDataFile: false,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const llmRequest = new LlmRequest({
			model: "gpt-4o",
			contents: [
				{
					role: "model",
					parts: [
						{
							codeExecutionResult: {
								outcome: "OUTCOME_OK",
								output: "42",
							},
						},
					],
				},
			],
		});

		await collect(
			requestProcessor.runAsync(
				{
					agent: new LlmAgent({
						name: "coder",
						model: "gpt-4o",
						codeExecutor: executor,
					}),
					session: { id: "s1", state: {}, events: [] },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.contents?.[0].role).toBe("user");
		expect(llmRequest.contents?.[0].parts?.[0].text).toContain(
			"```tool_outputs",
		);
		expect(llmRequest.contents?.[0].parts?.[0].text).toContain("42");
	});

	it("responseProcessor passes executionId when executor is stateful", async () => {
		class StubExecutor extends BaseCodeExecutor {
			executeCode = vi.fn(async () => ({
				stdout: "1",
				stderr: "",
				outputFiles: [],
			}));
		}
		const executor = new StubExecutor({
			stateful: true,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const saveArtifact = vi.fn(async () => 1);

		await collect(
			responseProcessor.runAsync(
				{
					agent: new LlmAgent({
						name: "coder",
						model: "gpt-4o",
						codeExecutor: executor,
					}),
					invocationId: "inv-stateful",
					appName: "app",
					userId: "u",
					session: {
						id: "sess-stateful",
						appName: "app",
						userId: "u",
						state: {},
						events: [],
					},
					artifactService: { saveArtifact },
				} as unknown as InvocationContext,
				{
					partial: false,
					content: {
						role: "model",
						parts: [{ text: "```python\nprint(1)\n```" }],
					},
				} as LlmResponse,
			),
		);

		expect(executor.executeCode).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				executionId: "sess-stateful",
			}),
		);
	});

	it("hasCodeExecutor is true only when codeExecutor property exists", () => {
		expect(hasCodeExecutor({ name: "a", codeExecutor: {} })).toBe(true);
		expect(hasCodeExecutor({ name: "a" })).toBe(false);
		expect(hasCodeExecutor(null)).toBeFalsy();
		expect(hasCodeExecutor("x")).toBeFalsy();
	});

	it("DATA_FILE_UTIL_MAP exposes csv loader template", () => {
		expect(DATA_FILE_UTIL_MAP["text/csv"].extension).toBe(".csv");
		expect(DATA_FILE_UTIL_MAP["text/csv"].loaderCodeTemplate).toContain(
			"pd.read_csv",
		);
	});
});
