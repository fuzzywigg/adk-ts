import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../../agents/llm-agent";
import type { InvocationContext } from "../../../agents/invocation-context";
import { BaseCodeExecutor } from "../../../code-executors/base-code-executor";
import { CodeExecutorContext } from "../../../code-executors/code-executor-context";
import {
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

describe("code-execution leftover: contents || []", () => {
	const contentsMatrix: Array<{
		label: string;
		setup: (req: LlmRequest) => void;
	}> = [
		{
			label: "undefined contents",
			setup: (req) => {
				delete (req as any).contents;
			},
		},
		{
			label: "null contents",
			setup: (req) => {
				(req as any).contents = null;
			},
		},
		{
			label: "empty contents array",
			setup: (req) => {
				req.contents = [];
			},
		},
	];

	for (const { label, setup } of contentsMatrix) {
		it(`requestProcessor tolerates ${label}`, async () => {
			const executor = new StubExecutor({ optimizeDataFile: false });
			const agent = new LlmAgent({
				name: "coder",
				model: "gpt-4o",
				codeExecutor: executor,
			});
			const llmRequest = new LlmRequest({ model: "gpt-4o" });
			setup(llmRequest);
			await expect(
				collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest)),
			).resolves.toEqual([]);
		});
	}

	it("iterates existing contents when present", async () => {
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
							executableCode: {
								code: "print(1)",
								language: "PYTHON",
							},
						},
					],
				},
				{
					role: "user",
					parts: [{ text: "plain" }],
				},
			],
		});
		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));
		expect(llmRequest.contents?.[0].parts?.[0]).toEqual({
			text: "```python\nprint(1)\n```",
		});
		expect(llmRequest.contents?.[1].parts?.[0]).toEqual({ text: "plain" });
	});

	it("contents || [] before push when optimizing seeded files", async () => {
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
		expect(Array.isArray(llmRequest.contents)).toBe(true);
		expect((llmRequest.contents?.length ?? 0) > 0).toBe(true);
		expect((events[0] as any).content?.parts?.[0]?.text).toContain(
			"Processing input file",
		);
	});

	it("null contents during optimize path coalesces before push", async () => {
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
				name: "data_2_1.csv",
				content: "x,y\n3,4",
				mimeType: "text/csv",
			},
		]);
		const llmRequest = new LlmRequest({ model: "gpt-4o" });
		(llmRequest as any).contents = null;

		await collect(
			requestProcessor.runAsync(
				{
					agent,
					invocationId: "inv-null",
					appName: "app",
					userId: "u",
					branch: "root",
					session: {
						id: "s2",
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
		expect(llmRequest.contents?.length).toBeGreaterThan(0);
	});
});

describe('code-execution leftover: codeBlockDelimiters[0] || ["",""]', () => {
	const delimiterMatrix: Array<{
		label: string;
		delimiters: Array<[string, string]>;
		code: string;
		expectedText: string;
	}> = [
		{
			label: "empty delimiters array falls back to bare code",
			delimiters: [],
			code: "print('bare')",
			expectedText: "print('bare')",
		},
		{
			label: "standard python fences",
			delimiters: [["```python\n", "\n```"]],
			code: "print(2)",
			expectedText: "```python\nprint(2)\n```",
		},
		{
			label: "custom angle delimiters",
			delimiters: [["<<", ">>"]],
			code: "x=1",
			expectedText: "<<x=1>>",
		},
		{
			label: "empty-string delimiters tuple",
			delimiters: [["", ""]],
			code: "y=2",
			expectedText: "y=2",
		},
		{
			label: "first of multiple delimiter pairs used",
			delimiters: [
				["BEGIN\n", "\nEND"],
				["IGNORE\n", "\nIGNORE"],
			],
			code: "z=3",
			expectedText: "BEGIN\nz=3\nEND",
		},
	];

	for (const { label, delimiters, code, expectedText } of delimiterMatrix) {
		it(label, async () => {
			const executor = new StubExecutor({
				optimizeDataFile: false,
				codeBlockDelimiters: delimiters,
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
									code,
									language: "PYTHON",
								},
							},
						],
					},
				],
			});
			await collect(
				requestProcessor.runAsync(makeInvocation(agent), llmRequest),
			);
			expect(llmRequest.contents?.[0].parts?.[0]).toEqual({
				text: expectedText,
			});
		});
	}

	it("empty delimiters also convert codeExecutionResult parts", async () => {
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
		expect(llmRequest.contents?.[0].parts?.[0]).toEqual({
			text: "OUT:42:END",
		});
		expect(llmRequest.contents?.[0].role).toBe("user");
	});

	it("undefined contents skips delimiter conversion without throw", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: false,
			codeBlockDelimiters: [],
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
	});
});

describe("code-execution leftover: response + helper edges", () => {
	it("responseProcessor skips partial regardless of code content", async () => {
		const events = await collect(
			responseProcessor.runAsync(
				makeInvocation(
					new LlmAgent({
						name: "coder",
						model: "gpt-4o",
						codeExecutor: new StubExecutor(),
					}),
				),
				{
					partial: true,
					content: {
						role: "model",
						parts: [{ text: "```python\nprint(1)\n```" }],
					},
				} as LlmResponse,
			),
		);
		expect(events).toEqual([]);
	});

	it("hasCodeExecutor false for agents without property", () => {
		expect(hasCodeExecutor({ name: "plain" } as any)).toBeFalsy();
		expect(hasCodeExecutor(null as any)).toBeFalsy();
	});

	it("getDataFilePreprocessingCode undefined for unknown mime", () => {
		expect(
			getDataFilePreprocessingCode({
				name: "x.bin",
				mimeType: "application/octet-stream",
				content: "abc",
			}),
		).toBeUndefined();
	});

	it("getOrSetExecutionId returns session id for stateful executor", () => {
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
		expect(getOrSetExecutionId(invocation, ctx)).toBe("sess-1");
	});

	it("postProcessCodeExecutionResult uses agent name", async () => {
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

	it("extractAndReplaceInlineFiles ignores non-csv", () => {
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
		expect(extractAndReplaceInlineFiles(ctx, llmRequest)).toHaveLength(0);
	});

	it("multiple contents with mixed executableCode convert independently", async () => {
		const executor = new StubExecutor({
			optimizeDataFile: false,
			codeBlockDelimiters: [["<", ">"]],
			executionResultDelimiters: ["[", "]"],
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
					parts: [{ executableCode: { code: "a", language: "PYTHON" } }],
				},
				{
					role: "model",
					parts: [{ executableCode: { code: "b", language: "PYTHON" } }],
				},
				{ role: "user", parts: [{ text: "stay" }] },
			],
		});
		await collect(requestProcessor.runAsync(makeInvocation(agent), llmRequest));
		expect(llmRequest.contents?.[0].parts?.[0]).toEqual({ text: "<a>" });
		expect(llmRequest.contents?.[1].parts?.[0]).toEqual({ text: "<b>" });
		expect(llmRequest.contents?.[2].parts?.[0]).toEqual({ text: "stay" });
	});
});
