import { BaseLlm, type LlmRequest } from "@adk/models";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockDebug,
	mockError,
	mockSetAttributes,
	mockRecordException,
	mockSetStatus,
	mockEnd,
	mockTracer,
} = vi.hoisted(() => {
	const setAttributes = vi.fn();
	const recordException = vi.fn();
	const setStatus = vi.fn();
	const end = vi.fn();
	const span = {
		setAttributes,
		recordException,
		setStatus,
		end,
	};
	return {
		mockDebug: vi.fn(),
		mockError: vi.fn(),
		mockSetAttributes: setAttributes,
		mockRecordException: recordException,
		mockSetStatus: setStatus,
		mockEnd: end,
		mockTracer: {
			startActiveSpan: vi.fn((_name: string, fn: (s: typeof span) => unknown) =>
				fn(span),
			),
		},
	};
});

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: mockDebug,
		error: mockError,
	})),
}));

vi.mock("../../telemetry", () => ({
	tracer: mockTracer,
}));

class TestLlm extends BaseLlm {
	public implResponses: any[] = [];
	public implError: Error | null = null;
	public lastStreamFlag: boolean | undefined;

	constructor(model = "test-model") {
		super(model);
	}

	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
		stream?: boolean,
	): AsyncGenerator<any, void, unknown> {
		this.lastStreamFlag = stream;
		if (this.implError) {
			throw this.implError;
		}
		for (const resp of this.implResponses) {
			yield resp;
		}
	}
}

describe("BaseLlm", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm();
	});

	it("should set model in constructor", () => {
		expect(llm.model).toBe("test-model");
		const custom = new TestLlm("custom-model");
		expect(custom.model).toBe("custom-model");
	});

	it("supportedModels returns empty array", () => {
		expect(BaseLlm.supportedModels()).toEqual([]);
	});

	describe("maybeAppendUserContent", () => {
		it("should add user content if contents is undefined", () => {
			const req: any = {};
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(1);
			expect(req.contents[0].role).toBe("user");
			expect(req.contents[0].parts[0].text).toBe(
				"Handle the requests as specified in the System Instruction.",
			);
		});

		it("should add user content if contents is empty", () => {
			const req: any = { contents: [] };
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(1);
			expect(req.contents[0].role).toBe("user");
			expect(req.contents[0].parts[0].text).toBe(
				"Handle the requests as specified in the System Instruction.",
			);
		});

		it("should append user content if last role is not user", () => {
			const req: any = { contents: [{ role: "system", parts: [] }] };
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(2);
			expect(req.contents[1].role).toBe("user");
			expect(req.contents[1].parts[0].text).toBe(
				"Continue processing previous requests as instructed. Exit or provide a summary if no more outputs are needed.",
			);
		});

		it("should append when last role is model/assistant", () => {
			const req: any = {
				contents: [
					{ role: "user", parts: [{ text: "hi" }] },
					{ role: "model", parts: [{ text: "hello" }] },
				],
			};
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(3);
			expect(req.contents[2].role).toBe("user");
		});

		it("should not append if last role is user", () => {
			const req: any = { contents: [{ role: "user", parts: [] }] };
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(1);
		});
	});

	describe("generateContentAsync", () => {
		it("invokes tracer with model-scoped span name", async () => {
			llm.implResponses = [{ content: { parts: [{ text: "ok" }] } }];
			const req: any = {
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			};

			for await (const _ of llm.generateContentAsync(req)) {
				/* drain */
			}

			expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
				"llm_generate [test-model]",
				expect.any(Function),
			);
		});

		it("sets default request attributes when config is missing", async () => {
			llm.implResponses = [{ content: { parts: [{ text: "ok" }] } }];
			const req: any = {
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			};

			for await (const _ of llm.generateContentAsync(req)) {
				/* drain */
			}

			expect(mockSetAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					"gen_ai.system.name": "iqai-adk",
					"gen_ai.operation.name": "generate",
					"gen_ai.request.model": "test-model",
					"gen_ai.request.max_tokens": 0,
					"gen_ai.request.temperature": 0,
					"gen_ai.request.top_p": 0,
					"adk.streaming": false,
				}),
			);
		});

		it("forwards config token/temperature/topP and streaming flag", async () => {
			llm.implResponses = [{ content: { parts: [{ text: "ok" }] } }];
			const req: any = {
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { maxOutputTokens: 128, temperature: 0.4, topP: 0.9 },
			};

			for await (const _ of llm.generateContentAsync(req, true)) {
				/* drain */
			}

			expect(llm.lastStreamFlag).toBe(true);
			expect(mockSetAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					"gen_ai.request.max_tokens": 128,
					"gen_ai.request.temperature": 0.4,
					"gen_ai.request.top_p": 0.9,
					"adk.streaming": true,
				}),
			);
		});

		it("truncates long text parts in adk.llm_request and marks non-text", async () => {
			llm.implResponses = [{ content: { parts: [{ text: "ok" }] } }];
			const long = "x".repeat(250);
			const req: any = {
				contents: [
					{
						role: "user",
						parts: [{ text: long }, { inlineData: { data: "abc" } }],
					},
				],
			};

			for await (const _ of llm.generateContentAsync(req)) {
				/* drain */
			}

			const firstAttrs = mockSetAttributes.mock.calls[0][0];
			const payload = JSON.parse(firstAttrs["adk.llm_request"]);
			expect(payload.contents[0].parts[0].text).toBe(`${"x".repeat(200)}...`);
			expect(payload.contents[0].parts[1].text).toBe("[non_text_content]");
		});

		it("does not append ellipsis for text at or under 200 chars", async () => {
			llm.implResponses = [{ content: { parts: [{ text: "ok" }] } }];
			const exact = "y".repeat(200);
			const req: any = {
				contents: [{ role: "user", parts: [{ text: exact }] }],
			};

			for await (const _ of llm.generateContentAsync(req)) {
				/* drain */
			}

			const firstAttrs = mockSetAttributes.mock.calls[0][0];
			const payload = JSON.parse(firstAttrs["adk.llm_request"]);
			expect(payload.contents[0].parts[0].text).toBe(exact);
		});

		it("aggregates usage across multiple responses", async () => {
			llm.implResponses = [
				{
					finish_reason: "partial",
					usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
				},
				{
					finish_reason: "STOP",
					usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 },
				},
			];
			const req: any = {
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			};

			const yielded: any[] = [];
			for await (const response of llm.generateContentAsync(req)) {
				yielded.push(response);
			}

			expect(yielded).toHaveLength(2);
			expect(mockSetAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					"gen_ai.response.finish_reasons": ["partial"],
					"gen_ai.usage.input_tokens": 1,
					"gen_ai.usage.output_tokens": 2,
					"gen_ai.usage.total_tokens": 3,
				}),
			);
			expect(mockSetAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					"gen_ai.response.finish_reasons": ["STOP"],
					"gen_ai.usage.input_tokens": 4,
					"gen_ai.usage.output_tokens": 5,
					"gen_ai.usage.total_tokens": 9,
				}),
			);
			expect(mockSetAttributes).toHaveBeenCalledWith({
				"adk.response_count": 2,
				"adk.total_tokens": 12,
			});
			expect(mockEnd).toHaveBeenCalled();
		});

		it("defaults finish_reason and token fields when usage present but sparse", async () => {
			llm.implResponses = [{ usage: {} }];
			const req: any = {
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			};

			for await (const _ of llm.generateContentAsync(req)) {
				/* drain */
			}

			expect(mockSetAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					"gen_ai.response.finish_reasons": ["unknown"],
					"gen_ai.usage.input_tokens": 0,
					"gen_ai.usage.output_tokens": 0,
					"gen_ai.usage.total_tokens": 0,
				}),
			);
			expect(mockSetAttributes).toHaveBeenCalledWith({
				"adk.response_count": 1,
				"adk.total_tokens": 0,
			});
		});

		it("skips per-response usage attrs when response has no usage", async () => {
			llm.implResponses = [{ content: { parts: [{ text: "bare" }] } }];
			const req: any = {
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			};

			for await (const _ of llm.generateContentAsync(req)) {
				/* drain */
			}

			const usageCalls = mockSetAttributes.mock.calls.filter(
				([attrs]) => attrs && "gen_ai.usage.total_tokens" in attrs,
			);
			expect(usageCalls).toHaveLength(0);
			expect(mockSetAttributes).toHaveBeenCalledWith({
				"adk.response_count": 1,
				"adk.total_tokens": 0,
			});
		});

		it("records exception, sets status, logs, rethrows, and ends span", async () => {
			const boom = new Error("impl failed");
			llm.implError = boom;
			const req: any = {
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			};

			await expect(async () => {
				for await (const _ of llm.generateContentAsync(req)) {
					/* drain */
				}
			}).rejects.toThrow("impl failed");

			expect(mockRecordException).toHaveBeenCalledWith(boom);
			expect(mockSetStatus).toHaveBeenCalledWith({
				code: 2,
				message: "impl failed",
			});
			expect(mockError).toHaveBeenCalledWith("❌ ADK LLM Error:", {
				model: "test-model",
				error: "impl failed",
			});
			expect(mockEnd).toHaveBeenCalled();
		});

		it("calls maybeAppendUserContent before impl", async () => {
			llm.implResponses = [{ content: { parts: [{ text: "ok" }] } }];
			const req: any = {
				contents: [{ role: "model", parts: [{ text: "prior" }] }],
			};

			for await (const _ of llm.generateContentAsync(req)) {
				/* drain */
			}

			expect(req.contents).toHaveLength(2);
			expect(req.contents[1].role).toBe("user");
		});

		it("yields zero responses and still records counts", async () => {
			llm.implResponses = [];
			const req: any = {
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			};

			const yielded: any[] = [];
			for await (const response of llm.generateContentAsync(req)) {
				yielded.push(response);
			}

			expect(yielded).toHaveLength(0);
			expect(mockSetAttributes).toHaveBeenCalledWith({
				"adk.response_count": 0,
				"adk.total_tokens": 0,
			});
		});
	});

	describe("connect", () => {
		it("should throw error", () => {
			expect(() => llm.connect({} as any)).toThrow(
				"Live connection is not supported for test-model.",
			);
		});

		it("includes the concrete model name in the error", () => {
			const named = new TestLlm("gemini-live");
			expect(() => named.connect({} as any)).toThrow(
				"Live connection is not supported for gemini-live.",
			);
		});
	});
});
