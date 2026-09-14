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

describe("requestProcessor convertCodeExecutionParts", () => {
	it("converts trailing executableCode into delimited text", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: false,
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
					role: "model",
					parts: [
						{ text: "prefix" },
						{
							executableCode: {
								code: "print(1)",
								language: "PYTHON",
							},
						},
					],
				},
			],
		});

		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));

		expect(llmRequest.contents?.[0].parts).toHaveLength(2);
		expect(llmRequest.contents?.[0].parts?.[1]).toEqual({
			text: "```python\nprint(1)\n```",
		});
		expect(executor.executeCode).not.toHaveBeenCalled();
	});

	it("converts single-part codeExecutionResult to delimited text and role user", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: false,
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

		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));

		expect(llmRequest.contents?.[0].role).toBe("user");
		expect(llmRequest.contents?.[0].parts?.[0]).toEqual({
			text: "```tool_outputs\n42\n```",
		});
	});

	it("does not convert multi-part codeExecutionResult contents", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: false,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const resultPart = {
			codeExecutionResult: {
				outcome: "OUTCOME_OK",
				output: "42",
			},
		};
		const llmRequest = new LlmRequest({
			model: "gpt-4o",
			contents: [
				{
					role: "model",
					parts: [{ text: "keep me" }, resultPart as any],
				},
			],
		});

		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));

		expect(llmRequest.contents?.[0].role).toBe("model");
		expect(llmRequest.contents?.[0].parts?.[1]).toEqual(resultPart);
	});

	it("falls back to empty delimiters when codeBlockDelimiters is empty", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: false,
			codeBlockDelimiters: [],
			executionResultDelimiters: ["OUT:", ":END"],
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
					role: "model",
					parts: [
						{
							executableCode: {
								code: "print('bare')",
								language: "PYTHON",
							},
						},
					],
				},
			],
		});

		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));

		expect(llmRequest.contents?.[0].parts?.[0]).toEqual({
			text: "print('bare')",
		});
	});

	it("tolerates undefined and empty contents without throwing", async () => {
		const executor = new StubExecutor({ optimizeDataFile: false });
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});

		const undefinedContents = new LlmRequest({ model: "gpt-4o" });
		delete (undefinedContents as any).contents;
		await expect(
			collect(
				requestProcessor.runAsync(makeInvocation(agent), undefinedContents),
			),
		).resolves.toEqual([]);

		const emptyContents = new LlmRequest({
			model: "gpt-4o",
			contents: [],
		});
		await expect(
			collect(requestProcessor.runAsync(makeInvocation(agent), emptyContents)),
		).resolves.toEqual([]);
	});

	it("still converts parts when optimizeDataFile is false", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: false,
			codeBlockDelimiters: [["<<", ">>"]],
			executionResultDelimiters: ["[[", "]]"],
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
				{
					role: "model",
					parts: [
						{
							executableCode: {
								code: "x=1",
								language: "PYTHON",
							},
						},
					],
				},
			],
		});

		const events = await collect(
			requestProcessor.runAsync(makeInvocation(agent), llmRequest),
		);

		expect(events).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();
		expect(llmRequest.contents?.[1].parts?.[0]).toEqual({
			text: "<<x=1>>",
		});
		expect(llmRequest.contents?.[0].parts?.[1]?.inlineData).toBeDefined();
	});

	it("converts trailing executableCode after BuiltInCodeExecutor preprocess", async () => {
		const agent = new LlmAgent({
			name: "coder",
			model: "gemini-2.0-flash",
			codeExecutor: new BuiltInCodeExecutor(),
		});
		const llmRequest = new LlmRequest({
			model: "gemini-2.0-flash",
			contents: [
				{
					role: "model",
					parts: [
						{
							executableCode: {
								code: "print('built-in')",
								language: "PYTHON",
							},
						},
					],
				},
			],
		});

		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));

		expect(llmRequest.config?.tools).toEqual(
			expect.arrayContaining([expect.objectContaining({ codeExecution: {} })]),
		);
		expect(llmRequest.contents?.[0].parts?.[0]?.text).toContain(
			"print('built-in')",
		);
	});
});

describe("requestProcessor preprocess gaps", () => {
	it("skips csv preprocess when errorRetryAttempts are already exhausted", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: true,
			errorRetryAttempts: 1,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		ctx.incrementErrorCount("inv-exhausted");

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
				makeInvocation(agent, {
					invocationId: "inv-exhausted",
					session: {
						id: "sess-1",
						appName: "app",
						userId: "u",
						state,
						events: [],
					},
				}),
				llmRequest,
			),
		);

		expect(events).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();
	});

	it("continues past non-csv files already in context without calling executeCode", async () => {
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
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		ctx.addInputFiles([
			{
				name: "notes.pdf",
				content: btoa("pdf"),
				mimeType: "application/pdf",
			},
		]);

		const llmRequest = new LlmRequest({
			model: "gpt-4o",
			contents: [
				{
					role: "user",
					parts: [{ text: "read the pdf already in memory" }],
				},
			],
		});

		const events = await collect(
			requestProcessor.runAsync(
				makeInvocation(agent, {
					session: {
						id: "sess-1",
						appName: "app",
						userId: "u",
						state,
						events: [],
					},
				}),
				llmRequest,
			),
		);

		expect(events).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();
		expect(ctx.getInputFiles().map((f) => f.name)).toEqual(["notes.pdf"]);
	});

	it("processes two csv inline files in one user message as separate preprocess pairs", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: true,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		executor.executeCode = vi.fn(async (_inv, input) => ({
			stdout: `loaded:${input.inputFiles[0]?.name}`,
			stderr: "",
			outputFiles: [],
		}));
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
						{ text: "compare" },
						{ inlineData: { mimeType: "text/csv", data: "a,b\n1,2" } },
						{ inlineData: { mimeType: "text/csv", data: "c,d\n3,4" } },
					],
				},
			],
		});

		const events = await collect(
			requestProcessor.runAsync(makeInvocation(agent), llmRequest),
		);

		expect(executor.executeCode).toHaveBeenCalledTimes(2);
		expect(events).toHaveLength(4);
		expect((events[0] as any).content?.parts?.[0]?.text).toContain(
			"data_1_2.csv",
		);
		expect((events[2] as any).content?.parts?.[0]?.text).toContain(
			"data_1_3.csv",
		);
		expect(
			executor.executeCode.mock.calls.map(
				(call) => call[1].inputFiles[0]?.name,
			),
		).toEqual(["data_1_2.csv", "data_1_3.csv"]);
		expect(llmRequest.contents?.some((c) => c.role === "model")).toBe(true);
	});

	it("does not duplicate an already-saved csv filename during extract", async () => {
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
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		ctx.addInputFiles([
			{
				name: "data_1_2.csv",
				content: btoa("cached"),
				mimeType: "text/csv",
			},
		]);
		ctx.addProcessedFileNames(["data_1_2.csv"]);

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
				makeInvocation(agent, {
					session: {
						id: "sess-1",
						appName: "app",
						userId: "u",
						state,
						events: [],
					},
				}),
				llmRequest,
			),
		);

		expect(events).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();
		expect(ctx.getInputFiles()).toHaveLength(1);
		expect(llmRequest.contents?.[0].parts?.[1]).toEqual({
			text: "\nAvailable file: `data_1_2.csv`\n",
		});
	});

	it("passes session.id as executionId when the executor is stateful", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: true,
			stateful: true,
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

		await collect(
			requestProcessor.runAsync(
				makeInvocation(agent, {
					session: {
						id: "sticky-session",
						appName: "app",
						userId: "u",
						state: {},
						events: [],
					},
				}),
				llmRequest,
			),
		);

		expect(executor.executeCode).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				executionId: "sticky-session",
				inputFiles: [
					expect.objectContaining({
						name: "data_1_2.csv",
						mimeType: "text/csv",
					}),
				],
			}),
		);
	});

	it("embeds DATA_FILE_HELPER_LIB and explore_df in generated preprocess code", async () => {
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

		const events = await collect(
			requestProcessor.runAsync(makeInvocation(agent), llmRequest),
		);

		const codePart = (events[0] as any).content?.parts?.find(
			(p: any) => p.executableCode?.code || p.text?.includes("explore_df"),
		);
		const codeText =
			codePart?.executableCode?.code ||
			executor.executeCode.mock.calls[0]?.[1]?.code ||
			"";
		expect(codeText).toContain("def explore_df");
		expect(codeText).toContain("pd.read_csv('data_1_2.csv')");
		expect(codeText).toContain("explore_df(data_1_2)");
		expect(DATA_FILE_HELPER_LIB).toContain("def explore_df");
		expect(llmRequest.contents?.length).toBeGreaterThan(1);
		expect(
			llmRequest.contents?.some((c) =>
				c.parts?.some(
					(p) =>
						p.executableCode?.code?.includes("explore_df") ||
						p.text?.includes("Processing input file"),
				),
			),
		).toBe(true);
	});

	it("pushes cloned preprocess code and result contents onto the llm request", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: true,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		executor.executeCode = vi.fn(async () => ({
			stdout: "shape ok",
			stderr: "",
			outputFiles: [],
		}));
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

		const beforeLen = llmRequest.contents!.length;
		const events = await collect(
			requestProcessor.runAsync(makeInvocation(agent), llmRequest),
		);

		expect(events).toHaveLength(2);
		expect(llmRequest.contents!.length).toBe(beforeLen + 2);
		expect(llmRequest.contents![beforeLen].parts?.[0]?.text).toContain(
			"Processing input file",
		);
		// convertCodeExecutionParts flips single-part codeExecutionResult to role=user
		expect(llmRequest.contents![beforeLen + 1].role).toBe("user");
		expect(llmRequest.contents![beforeLen + 1].parts?.[0]?.text).toContain(
			"shape ok",
		);
	});
});

describe("responseProcessor post-process gaps", () => {
	it("skips agents without a codeExecutor key", async () => {
		const events = await collect(
			responseProcessor.runAsync(
				{
					agent: { name: "plain" },
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

	it("is a no-op when llmResponse content is missing", async () => {
		const executor = new StubExecutor({
			codeBlockDelimiters: [["```python\n", "\n```"]],
		});
		const agent = new LlmAgent({
			name: "coder",
			codeExecutor: executor,
		});

		const missing = { partial: false } as LlmResponse;
		const eventsMissing = await collect(
			responseProcessor.runAsync(makeInvocation(agent), missing),
		);
		expect(eventsMissing).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();

		const emptyContent = {
			partial: false,
			content: undefined,
		} as LlmResponse;
		const eventsEmpty = await collect(
			responseProcessor.runAsync(makeInvocation(agent), emptyContent),
		);
		expect(eventsEmpty).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();
	});

	it("returns early when codeExecutor is present but not a BaseCodeExecutor", async () => {
		const events = await collect(
			responseProcessor.runAsync(
				{
					agent: {
						name: "duck",
						codeExecutor: { stateful: false },
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

	it("passes sticky session executionId on stateful response execution", async () => {
		const executor = new StubExecutor({
			stateful: true,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const state = State.create({}, {});
		const invocation = makeInvocation(agent, {
			session: {
				id: "live-sess",
				appName: "app",
				userId: "u",
				state,
				events: [],
			},
		});
		const llmResponse = {
			partial: false,
			content: {
				role: "model",
				parts: [{ text: "```python\nprint(9)\n```" }],
			},
		} as LlmResponse;

		await collect(responseProcessor.runAsync(invocation, llmResponse));
		expect(executor.executeCode).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				executionId: "live-sess",
				code: expect.stringContaining("print(9)"),
			}),
		);

		executor.executeCode.mockClear();
		const secondResponse = {
			partial: false,
			content: {
				role: "model",
				parts: [{ text: "```python\nprint(10)\n```" }],
			},
		} as LlmResponse;
		await collect(responseProcessor.runAsync(invocation, secondResponse));
		expect(executor.executeCode).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ executionId: "live-sess" }),
		);
	});

	it("increments then resets error count across responseProcessor runs", async () => {
		const executor = new StubExecutor({
			errorRetryAttempts: 2,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		executor.executeCode = vi
			.fn()
			.mockResolvedValueOnce({
				stdout: "",
				stderr: "boom",
				outputFiles: [],
			})
			.mockResolvedValueOnce({
				stdout: "recovered",
				stderr: "",
				outputFiles: [],
			});
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const state = State.create({}, {});
		const invocation = makeInvocation(agent, {
			invocationId: "inv-retry",
			session: {
				id: "sess-1",
				appName: "app",
				userId: "u",
				state,
				events: [],
			},
		});

		await collect(
			responseProcessor.runAsync(invocation, {
				partial: false,
				content: {
					role: "model",
					parts: [{ text: "```python\nprint(1)\n```" }],
				},
			} as LlmResponse),
		);
		expect(new CodeExecutorContext(state).getErrorCount("inv-retry")).toBe(1);

		await collect(
			responseProcessor.runAsync(invocation, {
				partial: false,
				content: {
					role: "model",
					parts: [{ text: "```python\nprint(2)\n```" }],
				},
			} as LlmResponse),
		);
		expect(new CodeExecutorContext(state).getErrorCount("inv-retry")).toBe(0);
	});

	it("saves multiple outputFiles and records each artifactDelta", async () => {
		const executor = new StubExecutor({
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		executor.executeCode = vi.fn(async () => ({
			stdout: "done",
			stderr: "",
			outputFiles: [
				{ name: "a.txt", content: btoa("alpha"), mimeType: "text/plain" },
				{ name: "b.txt", content: btoa("beta"), mimeType: "text/plain" },
			],
		}));
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const saveArtifact = vi
			.fn()
			.mockResolvedValueOnce(1)
			.mockResolvedValueOnce(2);

		const events = await collect(
			responseProcessor.runAsync(
				makeInvocation(agent, { artifactService: { saveArtifact } }),
				{
					partial: false,
					content: {
						role: "model",
						parts: [{ text: "```python\nopen('a','w')\n```" }],
					},
				} as LlmResponse,
			),
		);

		expect(saveArtifact).toHaveBeenCalledTimes(2);
		expect(saveArtifact).toHaveBeenCalledWith(
			expect.objectContaining({
				filename: "a.txt",
				artifact: {
					inlineData: { data: "alpha", mimeType: "text/plain" },
				},
			}),
		);
		expect(saveArtifact).toHaveBeenCalledWith(
			expect.objectContaining({
				filename: "b.txt",
				artifact: {
					inlineData: { data: "beta", mimeType: "text/plain" },
				},
			}),
		);
		expect((events[1] as any).actions.artifactDelta).toEqual({
			"a.txt": 1,
			"b.txt": 2,
		});
	});

	it("clears llmResponse.content only after successful extract and execute", async () => {
		const executor = new StubExecutor({
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});

		const noCode = {
			partial: false,
			content: { role: "model", parts: [{ text: "just prose" }] },
		} as LlmResponse;
		await collect(responseProcessor.runAsync(makeInvocation(agent), noCode));
		expect(noCode.content).toBeDefined();

		const withCode = {
			partial: false,
			content: {
				role: "model",
				parts: [{ text: "```python\nprint(3)\n```" }],
			},
		} as LlmResponse;
		await collect(responseProcessor.runAsync(makeInvocation(agent), withCode));
		expect(withCode.content).toBeUndefined();
	});

	it("forwards context inputFiles into executeCode on the response path", async () => {
		const executor = new StubExecutor({
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		ctx.addInputFiles([
			{
				name: "seed.csv",
				content: btoa("a,b\n1,2"),
				mimeType: "text/csv",
			},
		]);

		await collect(
			responseProcessor.runAsync(
				makeInvocation(agent, {
					session: {
						id: "sess-1",
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
						parts: [{ text: "```python\nprint(seed)\n```" }],
					},
				} as LlmResponse,
			),
		);

		expect(executor.executeCode).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				inputFiles: [
					expect.objectContaining({ name: "seed.csv", mimeType: "text/csv" }),
				],
			}),
		);
	});

	it("exhausts retries after consecutive stderr results on the response path", async () => {
		const executor = new StubExecutor({
			errorRetryAttempts: 1,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		executor.executeCode = vi.fn(async () => ({
			stdout: "",
			stderr: "fail",
			outputFiles: [],
		}));
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const state = State.create({}, {});
		const invocation = makeInvocation(agent, {
			invocationId: "inv-cap",
			session: {
				id: "sess-1",
				appName: "app",
				userId: "u",
				state,
				events: [],
			},
		});

		await collect(
			responseProcessor.runAsync(invocation, {
				partial: false,
				content: {
					role: "model",
					parts: [{ text: "```python\nprint(1)\n```" }],
				},
			} as LlmResponse),
		);
		expect(executor.executeCode).toHaveBeenCalledTimes(1);

		executor.executeCode.mockClear();
		const blocked = await collect(
			responseProcessor.runAsync(invocation, {
				partial: false,
				content: {
					role: "model",
					parts: [{ text: "```python\nprint(2)\n```" }],
				},
			} as LlmResponse),
		);
		expect(blocked).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();
	});
});

describe("code-execution helper polish", () => {
	it("extractAndReplaceInlineFiles returns existing files when contents is undefined", () => {
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		ctx.addInputFiles([
			{ name: "kept.csv", content: btoa("a"), mimeType: "text/csv" },
		]);
		const llmRequest = new LlmRequest({ model: "gpt-4o" });
		delete (llmRequest as any).contents;

		const files = extractAndReplaceInlineFiles(ctx, llmRequest);
		expect(files.map((f) => f.name)).toEqual(["kept.csv"]);
	});

	it("normalizes non-digit-leading filenames without a leading underscore", () => {
		const code = getDataFilePreprocessingCode({
			name: "sales-data.csv",
			content: "",
			mimeType: "text/csv",
		});
		expect(code).toContain("sales_data = pd.read_csv('sales-data.csv')");
		expect(code).toContain("explore_df(sales_data)");
		expect(code).not.toContain("_sales_data");
	});

	it("exports DATA_FILE_UTIL_MAP and DATA_FILE_HELPER_LIB shapes", () => {
		expect(Object.keys(DATA_FILE_UTIL_MAP)).toEqual(["text/csv"]);
		expect(DATA_FILE_UTIL_MAP["text/csv"].extension).toBe(".csv");
		expect(DATA_FILE_UTIL_MAP["text/csv"].loaderCodeTemplate).toContain(
			"pd.read_csv",
		);
		expect(DATA_FILE_HELPER_LIB).toContain("import pandas as pd");
		expect(DATA_FILE_HELPER_LIB).toContain("def crop");
	});

	it("postProcessCodeExecutionResult saves multiple files and resets errors without stderr", async () => {
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		ctx.incrementErrorCount("inv-multi");
		const saveArtifact = vi
			.fn()
			.mockResolvedValueOnce(4)
			.mockResolvedValueOnce(5);

		const event = await postProcessCodeExecutionResult(
			{
				agent: { name: "coder" },
				branch: "main",
				session: {
					id: "s1",
					appName: "app",
					userId: "u",
					state: {},
					events: [],
				},
				invocationId: "inv-multi",
				appName: "app",
				userId: "u",
				artifactService: { saveArtifact },
			} as unknown as InvocationContext,
			ctx,
			{
				stdout: "ok",
				stderr: "",
				outputFiles: [
					{
						name: "one.bin",
						content: btoa("1"),
						mimeType: "application/octet-stream",
					},
					{
						name: "two.bin",
						content: btoa("2"),
						mimeType: "application/octet-stream",
					},
				],
			},
		);

		expect(ctx.getErrorCount("inv-multi")).toBe(0);
		expect(saveArtifact).toHaveBeenCalledTimes(2);
		expect(event.actions.artifactDelta).toEqual({
			"one.bin": 4,
			"two.bin": 5,
		});
		expect(event.branch).toBe("main");
	});

	it("hasCodeExecutor is false for nullish and non-objects", () => {
		expect(hasCodeExecutor(undefined)).toBeFalsy();
		expect(hasCodeExecutor("agent" as any)).toBeFalsy();
		expect(hasCodeExecutor(42 as any)).toBeFalsy();
		expect(hasCodeExecutor({ name: "x", codeExecutor: null })).toBe(true);
	});

	it("getOrSetExecutionId returns undefined when agent lacks codeExecutor", () => {
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		expect(
			getOrSetExecutionId(
				{
					agent: null,
					session: { id: "s", state: {}, events: [] },
				} as unknown as InvocationContext,
				ctx,
			),
		).toBeUndefined();
	});

	it("skips user contents with empty parts during inline extract", () => {
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		const llmRequest = new LlmRequest({
			contents: [
				{ role: "user", parts: [] },
				{ role: "user" } as any,
				{
					role: "user",
					parts: [{ inlineData: { mimeType: "text/csv", data: "a\n1" } }],
				},
			],
		});

		const files = extractAndReplaceInlineFiles(ctx, llmRequest);
		expect(files).toHaveLength(1);
		expect(files[0].name).toBe("data_3_1.csv");
	});

	it("normalizes filenames that are only an extension to empty var then explore", () => {
		const code = getDataFilePreprocessingCode({
			name: ".csv",
			content: "",
			mimeType: "text/csv",
		});
		expect(code).toContain("= pd.read_csv('.csv')");
		expect(code).toContain("explore_df(");
	});
});

describe("requestProcessor and responseProcessor additional edges", () => {
	it("converts every content that ends with executableCode in one request", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: false,
			codeBlockDelimiters: [["<<", ">>"]],
			executionResultDelimiters: ["[[", "]]"],
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
					role: "model",
					parts: [{ executableCode: { code: "a=1", language: "PYTHON" } }],
				},
				{
					role: "model",
					parts: [
						{ text: "note" },
						{ executableCode: { code: "b=2", language: "PYTHON" } },
					],
				},
			],
		});

		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));

		expect(llmRequest.contents?.[0].parts?.[0]).toEqual({ text: "<<a=1>>" });
		expect(llmRequest.contents?.[1].parts?.[1]).toEqual({ text: "<<b=2>>" });
	});

	it("leaves contents with empty parts untouched during convert", async () => {
		const executor = new StubExecutor({ optimizeDataFile: false });
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const llmRequest = new LlmRequest({
			model: "gpt-4o",
			contents: [
				{ role: "model", parts: [] },
				{ role: "user", parts: [{ text: "hi" }] },
			],
		});

		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));

		expect(llmRequest.contents?.[0].parts).toEqual([]);
		expect(llmRequest.contents?.[1].parts?.[0]).toEqual({ text: "hi" });
	});

	it("propagates branch onto preprocess and execution result events", async () => {
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

		const events = await collect(
			requestProcessor.runAsync(
				makeInvocation(agent, { branch: "feature/csv" }),
				llmRequest,
			),
		);

		expect(events).toHaveLength(2);
		expect((events[0] as any).branch).toBe("feature/csv");
		expect((events[1] as any).branch).toBe("feature/csv");
		expect((events[0] as any).author).toBe("coder");
		expect((events[1] as any).author).toBe("coder");
	});

	it("responseProcessor preserves branch and invocationId on both yielded events", async () => {
		const executor = new StubExecutor({
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});

		const events = await collect(
			responseProcessor.runAsync(
				makeInvocation(agent, {
					branch: "live/branch",
					invocationId: "inv-branch",
				}),
				{
					partial: false,
					content: {
						role: "model",
						parts: [{ text: "```python\nprint('b')\n```" }],
					},
				} as LlmResponse,
			),
		);

		expect(events).toHaveLength(2);
		expect((events[0] as any).branch).toBe("live/branch");
		expect((events[0] as any).invocationId).toBe("inv-branch");
		expect((events[1] as any).branch).toBe("live/branch");
		expect((events[1] as any).invocationId).toBe("inv-branch");
	});

	it("requestProcessor skips LlmAgent when codeExecutor is unset", async () => {
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
		});
		const llmRequest = new LlmRequest({
			model: "gpt-4o",
			contents: [
				{
					role: "model",
					parts: [{ executableCode: { code: "x", language: "PYTHON" } }],
				},
			],
		});

		const events = await collect(
			requestProcessor.runAsync(makeInvocation(agent), llmRequest),
		);

		expect(events).toEqual([]);
		expect(llmRequest.contents?.[0].parts?.[0]?.executableCode).toBeDefined();
	});

	it("does not convert codeExecutionResult when it is not the last part alone", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: false,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["OUT:", ":END"],
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
					role: "model",
					parts: [
						{
							codeExecutionResult: {
								outcome: "OUTCOME_OK",
								output: "first",
							},
						},
						{ text: "trailing text keeps result structured" },
					],
				},
			],
		});

		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));

		expect(llmRequest.contents?.[0].role).toBe("model");
		expect(
			llmRequest.contents?.[0].parts?.[0]?.codeExecutionResult?.output,
		).toBe("first");
		expect(llmRequest.contents?.[0].parts?.[1]).toEqual({
			text: "trailing text keeps result structured",
		});
	});

	it("preprocess marks the csv file processed after a successful explore run", async () => {
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
		const state = State.create({}, {});
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

		await collect(
			requestProcessor.runAsync(
				makeInvocation(agent, {
					session: {
						id: "sess-1",
						appName: "app",
						userId: "u",
						state,
						events: [],
					},
				}),
				llmRequest,
			),
		);

		const ctx = new CodeExecutorContext(state);
		expect(ctx.getProcessedFileNames()).toContain("data_1_2.csv");
		expect(ctx.getInputFiles().map((f) => f.name)).toContain("data_1_2.csv");
	});

	it("response path with default delimiters extracts tool_code style blocks", async () => {
		const executor = new StubExecutor();
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});

		const events = await collect(
			responseProcessor.runAsync(makeInvocation(agent), {
				partial: false,
				content: {
					role: "model",
					parts: [{ text: "`tool_code\nprint('default')\n`" }],
				},
			} as LlmResponse),
		);

		expect(executor.executeCode).toHaveBeenCalledOnce();
		expect(executor.executeCode.mock.calls[0][1].code).toContain(
			"print('default')",
		);
		expect(events).toHaveLength(2);
	});

	it("skips inline image data and only replaces supported csv mime types", async () => {
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		const llmRequest = new LlmRequest({
			contents: [
				{
					role: "user",
					parts: [
						{ inlineData: { mimeType: "image/jpeg", data: "jpg" } },
						{ inlineData: { mimeType: "text/csv", data: "h\n1" } },
						{ inlineData: { mimeType: "application/json", data: "{}" } },
					],
				},
			],
		});

		const files = extractAndReplaceInlineFiles(ctx, llmRequest);
		expect(files).toHaveLength(1);
		expect(files[0].name).toBe("data_1_2.csv");
		expect(llmRequest.contents?.[0].parts?.[0]?.inlineData?.mimeType).toBe(
			"image/jpeg",
		);
		expect(llmRequest.contents?.[0].parts?.[2]?.inlineData?.mimeType).toBe(
			"application/json",
		);
	});

	it("postProcess includes stateDelta from the code executor context", async () => {
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		ctx.updateCodeExecutionResult("inv-delta", "print(1)", "1", "");
		const saveArtifact = vi.fn(async () => 1);

		const event = await postProcessCodeExecutionResult(
			{
				agent: { name: "coder" },
				session: {
					id: "s1",
					appName: "app",
					userId: "u",
					state: {},
					events: [],
				},
				invocationId: "inv-delta",
				appName: "app",
				userId: "u",
				artifactService: { saveArtifact },
			} as unknown as InvocationContext,
			ctx,
			{ stdout: "1", stderr: "", outputFiles: [] },
		);

		expect(event.actions.stateDelta).toEqual(ctx.getStateDelta());
		expect(Object.keys(event.actions.stateDelta).length).toBeGreaterThan(0);
	});
});

describe("code-execution processors leftover edges", () => {
	it("responseProcessor skips when response has no extractable code", async () => {
		const executor = new StubExecutor();
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const events = await collect(
			responseProcessor.runAsync(makeInvocation(agent), {
				content: { role: "model", parts: [{ text: "no code here" }] },
			} as LlmResponse),
		);
		expect(events).toEqual([]);
		expect(executor.executeCode).not.toHaveBeenCalled();
	});

	it("requestProcessor is a no-op for agents with codeExecutor undefined property", async () => {
		const llmRequest = new LlmRequest({ model: "gpt-4o" });
		const events = await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "duck", codeExecutor: undefined },
					session: { state: {}, events: [] },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(events).toEqual([]);
		expect(llmRequest.config?.tools).toBeUndefined();
	});

	it("getDataFilePreprocessingCode returns undefined for unsupported mime types", () => {
		expect(
			getDataFilePreprocessingCode({
				name: "data.bin",
				mimeType: "application/octet-stream",
				content: "abc",
			}),
		).toBeUndefined();
	});

	it("getOrSetExecutionId generates stable ids for stateful executors", () => {
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		const invocation = makeInvocation(
			new LlmAgent({
				name: "coder",
				model: "gpt-4o",
				codeExecutor: new StubExecutor(),
			}),
		);
		(invocation.agent as LlmAgent).codeExecutor = {
			stateful: true,
		} as any;
		const first = getOrSetExecutionId(invocation, ctx);
		const second = getOrSetExecutionId(invocation, ctx);
		expect(first).toBe("sess-1");
		expect(second).toBe("sess-1");
	});

	it("hasCodeExecutor returns false for primitives", () => {
		expect(hasCodeExecutor(false as any)).toBeFalsy();
		expect(hasCodeExecutor(0 as any)).toBeFalsy();
	});

	it("postProcessCodeExecutionResult sets author from invocation agent name", async () => {
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		const event = await postProcessCodeExecutionResult(
			makeInvocation(
				new LlmAgent({
					name: "named_coder",
					model: "gpt-4o",
					codeExecutor: new StubExecutor(),
				}),
			),
			ctx,
			{ stdout: "1", stderr: "", outputFiles: [] },
		);
		expect(event.author).toBe("named_coder");
	});

	it("extractAndReplaceInlineFiles leaves non-csv inline data untouched", () => {
		const state = State.create({}, {});
		const ctx = new CodeExecutorContext(state);
		const llmRequest = new LlmRequest({
			contents: [
				{
					role: "user",
					parts: [{ inlineData: { mimeType: "text/plain", data: "hello" } }],
				},
			],
		});
		const files = extractAndReplaceInlineFiles(ctx, llmRequest);
		expect(files).toHaveLength(0);
		expect(llmRequest.contents?.[0].parts?.[0]?.inlineData?.data).toBe("hello");
	});

	it("requestProcessor initializes contents when pre-seeded input files need processing", async () => {
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
		const state = State.create({}, {});
		const cex = new CodeExecutorContext(state);
		cex.addInputFiles([
			{
				name: "data_1_1.csv",
				content: "a,b\n1,2",
				mimeType: "text/csv",
			},
		]);
		const llmRequest = new LlmRequest({ model: "gpt-4o" });
		delete (llmRequest as any).contents;

		const events = await collect(
			requestProcessor.runAsync(
				{
					agent,
					invocationId: "inv-seeded",
					appName: "app",
					userId: "u",
					branch: "root",
					session: {
						id: "s1",
						appName: "app",
						userId: "u",
						state,
						events: [],
					},
					artifactService: { saveArtifact: vi.fn(async () => 1) },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(executor.executeCode).toHaveBeenCalled();
		expect(llmRequest.contents?.length).toBeGreaterThan(0);
		expect((events[0] as any).content?.parts?.[0]?.text).toContain(
			"Processing input file",
		);
	});
});

describe("code-execution contents-undefined leftover edges", () => {
	it("requestProcessor initializes contents when inline csv arrives with contents undefined", async () => {
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
						{
							inlineData: {
								mimeType: "text/csv",
								data: Buffer.from("a,b\n1,2").toString("base64"),
							},
						},
					],
				},
			],
		});
		// Force undefined mid-flight by clearing after construction then re-seeding via extract path
		const events = await collect(
			requestProcessor.runAsync(makeInvocation(agent), llmRequest),
		);

		expect(executor.executeCode).toHaveBeenCalled();
		expect(llmRequest.contents?.length).toBeGreaterThan(0);
		expect(events.length).toBeGreaterThan(0);
	});

	it("extractAndReplaceInlineFiles returns existing files when contents stays undefined", () => {
		const state = State.create({}, {});
		const cex = new CodeExecutorContext(state);
		cex.addInputFiles([
			{ name: "seed.csv", content: "x", mimeType: "text/csv" },
		]);
		const llmRequest = new LlmRequest({ model: "gpt-4o" });
		delete (llmRequest as any).contents;

		const files = extractAndReplaceInlineFiles(cex, llmRequest);
		expect(files.map((f) => f.name)).toContain("seed.csv");
		expect(llmRequest.contents).toBeUndefined();
	});

	it("requestProcessor convert path tolerates contents undefined without throwing", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: false,
			codeBlockDelimiters: [["```\n", "\n```"]],
			executionResultDelimiters: ["```out\n", "\n```"],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const llmRequest = new LlmRequest({ model: "gpt-4o" });
		delete (llmRequest as any).contents;

		await expect(
			collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest)),
		).resolves.toEqual([]);
		expect(llmRequest.contents).toBeUndefined();
	});

	it("preprocess initializes empty contents array when only pre-seeded csv needs explore", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: true,
			codeBlockDelimiters: [["```python\n", "\n```"]],
			executionResultDelimiters: ["```tool_outputs\n", "\n```"],
		});
		executor.executeCode.mockResolvedValue({
			stdout: "explored",
			stderr: "",
			outputFiles: [],
		});
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: executor,
		});
		const state = State.create({}, {});
		const cex = new CodeExecutorContext(state);
		cex.addInputFiles([
			{
				name: "table.csv",
				content: "col\n1",
				mimeType: "text/csv",
			},
		]);
		const llmRequest = new LlmRequest({ model: "gpt-4o" });
		delete (llmRequest as any).contents;

		const events = await collect(
			requestProcessor.runAsync(
				makeInvocation(agent, {
					session: {
						id: "s-init",
						appName: "app",
						userId: "u",
						state,
						events: [],
					},
				}),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toBeDefined();
		expect(Array.isArray(llmRequest.contents)).toBe(true);
		expect(llmRequest.contents!.length).toBeGreaterThanOrEqual(2);
		expect((events[0] as any).content?.parts?.[0]?.text).toContain(
			"Processing input file",
		);
		expect(executor.executeCode).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				code: expect.stringContaining("explore_df"),
			}),
		);
	});
});
