import { BaseLlm, type LlmRequest } from "@adk/models";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

const {
	mockSetAttributes,
	mockRecordException,
	mockSetStatus,
	mockEnd,
	mockSpan,
	mockTracer,
} = vi.hoisted(() => {
	const mockSetAttributes = vi.fn();
	const mockRecordException = vi.fn();
	const mockSetStatus = vi.fn();
	const mockEnd = vi.fn();
	const mockSpan = {
		setAttributes: mockSetAttributes,
		recordException: mockRecordException,
		setStatus: mockSetStatus,
		end: mockEnd,
	};
	const mockTracer = {
		startActiveSpan: vi.fn(
			(_name: string, fn: (span: typeof mockSpan) => unknown) => fn(mockSpan),
		),
	};
	return {
		mockSetAttributes,
		mockRecordException,
		mockSetStatus,
		mockEnd,
		mockSpan,
		mockTracer,
	};
});

vi.mock("../../telemetry", () => ({
	tracer: mockTracer,
}));

class TestLlm extends BaseLlm {
	public implResponses: any[] = [];
	public implError: Error | null = null;

	constructor(model = "test-model") {
		super(model);
	}

	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
		_stream?: boolean,
	): AsyncGenerator<any, void, unknown> {
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
		mockTracer.startActiveSpan.mockImplementation(
			(_name: string, fn: (span: typeof mockSpan) => unknown) => fn(mockSpan),
		);
		llm = new TestLlm();
	});

	it("sets model in the constructor", () => {
		expect(llm.model).toBe("test-model");
		expect(new TestLlm("custom-model").model).toBe("custom-model");
	});

	it("supportedModels returns an empty array", () => {
		expect(BaseLlm.supportedModels()).toEqual([]);
	});

	describe("maybeAppendUserContent", () => {
		it("adds user content when contents is undefined", () => {
			const req: any = {};
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(1);
			expect(req.contents[0].role).toBe("user");
			expect(req.contents[0].parts[0].text).toBe(
				"Handle the requests as specified in the System Instruction.",
			);
		});

		it("adds user content when contents is empty", () => {
			const req: any = { contents: [] };
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(1);
			expect(req.contents[0].role).toBe("user");
		});

		it("appends user content when the last role is not user", () => {
			const req: any = {
				contents: [{ role: "model", parts: [{ text: "hi" }] }],
			};
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(2);
			expect(req.contents[1].role).toBe("user");
			expect(req.contents[1].parts[0].text).toBe(
				"Continue processing previous requests as instructed. Exit or provide a summary if no more outputs are needed.",
			);
		});

		it("does not append when the last role is already user", () => {
			const req: any = { contents: [{ role: "user", parts: [{ text: "q" }] }] };
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(1);
		});
	});

	describe("generateContentAsync (real BaseLlm path)", () => {
		it("wraps impl responses in a telemetry span and records usage", async () => {
			llm.implResponses = [
				{
					finish_reason: "STOP",
					usage: {
						prompt_tokens: 3,
						completion_tokens: 5,
						total_tokens: 8,
					},
					content: { role: "model", parts: [{ text: "hello" }] },
				},
			];
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { maxOutputTokens: 100, temperature: 0.2, topP: 0.9 },
			};

			const out: any[] = [];
			for await (const response of llm.generateContentAsync(req)) {
				out.push(response);
			}

			expect(out).toHaveLength(1);
			expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
				"llm_generate [test-model]",
				expect.any(Function),
			);
			expect(mockSetAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					"gen_ai.system.name": "iqai-adk",
					"gen_ai.operation.name": "generate",
					"gen_ai.request.model": "test-model",
					"gen_ai.request.max_tokens": 100,
					"gen_ai.request.temperature": 0.2,
					"gen_ai.request.top_p": 0.9,
					"adk.streaming": false,
				}),
			);
			expect(mockSetAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					"gen_ai.response.finish_reasons": ["STOP"],
					"gen_ai.usage.input_tokens": 3,
					"gen_ai.usage.output_tokens": 5,
					"gen_ai.usage.total_tokens": 8,
				}),
			);
			expect(mockSetAttributes).toHaveBeenCalledWith({
				"adk.response_count": 1,
				"adk.total_tokens": 8,
			});
			expect(mockEnd).toHaveBeenCalled();
		});

		it("marks streaming, truncates long text, and labels non-text parts", async () => {
			llm.implResponses = [
				{ content: { role: "model", parts: [{ text: "x" }] } },
			];
			const long = "a".repeat(250);
			const req: any = {
				contents: [
					{
						role: "user",
						parts: [
							{ text: long },
							{ inlineData: { data: "x", mimeType: "image/png" } },
						],
					},
				],
			};

			for await (const _ of llm.generateContentAsync(req, true)) {
			}

			const requestAttrCall = mockSetAttributes.mock.calls.find(
				(call) => call[0]?.["adk.llm_request"],
			);
			expect(requestAttrCall?.[0]["adk.streaming"]).toBe(true);
			const payload = JSON.parse(requestAttrCall?.[0]["adk.llm_request"]);
			expect(payload.contents[0].parts[0].text).toBe(`${"a".repeat(200)}...`);
			expect(payload.contents[0].parts[1].text).toBe("[non_text_content]");
		});

		it("defaults missing config/usage fields and finish_reason", async () => {
			llm.implResponses = [
				{ usage: {} },
				{ content: { role: "model", parts: [{ text: "ok" }] } },
			];
			const req: any = { contents: [{ role: "user", parts: [{ text: "q" }] }] };

			const out: any[] = [];
			for await (const response of llm.generateContentAsync(req)) {
				out.push(response);
			}

			expect(out).toHaveLength(2);
			expect(mockSetAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					"gen_ai.request.max_tokens": 0,
					"gen_ai.request.temperature": 0,
					"gen_ai.request.top_p": 0,
				}),
			);
			expect(mockSetAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					"gen_ai.response.finish_reasons": ["unknown"],
					"gen_ai.usage.input_tokens": 0,
					"gen_ai.usage.output_tokens": 0,
					"gen_ai.usage.total_tokens": 0,
				}),
			);
			expect(mockSetAttributes).toHaveBeenCalledWith({
				"adk.response_count": 2,
				"adk.total_tokens": 0,
			});
		});

		it("appends user content before generating when contents are empty", async () => {
			llm.implResponses = [
				{ content: { role: "model", parts: [{ text: "ok" }] } },
			];
			const req: any = { contents: [] };

			for await (const _ of llm.generateContentAsync(req)) {
			}

			expect(req.contents).toHaveLength(1);
			expect(req.contents[0].role).toBe("user");
		});

		it("records exceptions, sets span status, logs, and rethrows", async () => {
			const errorSpy = vi
				.spyOn(llm["logger"], "error")
				.mockImplementation(() => undefined);
			llm.implError = new Error("upstream failed");
			const req: any = { contents: [{ role: "user", parts: [{ text: "q" }] }] };

			await expect(async () => {
				for await (const _ of llm.generateContentAsync(req)) {
				}
			}).rejects.toThrow("upstream failed");

			expect(mockRecordException).toHaveBeenCalledWith(llm.implError);
			expect(mockSetStatus).toHaveBeenCalledWith({
				code: 2,
				message: "upstream failed",
			});
			expect(errorSpy).toHaveBeenCalledWith(
				"❌ ADK LLM Error:",
				expect.objectContaining({
					model: "test-model",
					error: "upstream failed",
				}),
			);
			expect(mockEnd).toHaveBeenCalled();
			errorSpy.mockRestore();
		});

		it("sums total_tokens across multiple usage-bearing chunks", async () => {
			llm.implResponses = [
				{ usage: { total_tokens: 4, prompt_tokens: 1, completion_tokens: 3 } },
				{ usage: { total_tokens: 6, prompt_tokens: 2, completion_tokens: 4 } },
			];
			const req: any = { contents: [{ role: "user", parts: [{ text: "q" }] }] };

			for await (const _ of llm.generateContentAsync(req, true)) {
			}

			expect(mockSetAttributes).toHaveBeenCalledWith({
				"adk.response_count": 2,
				"adk.total_tokens": 10,
			});
		});
	});

	describe("connect", () => {
		it("throws for unsupported live connections", () => {
			expect(() => llm.connect({} as any)).toThrow(
				"Live connection is not supported for test-model.",
			);
		});
	});
});
