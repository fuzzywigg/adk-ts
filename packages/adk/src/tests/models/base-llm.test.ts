import { BaseLlm, type LlmRequest, type LlmResponse } from "@adk/models";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockLogger,
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
		mockLogger: {
			debug: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
		},
		mockSetAttributes,
		mockRecordException,
		mockSetStatus,
		mockEnd,
		mockSpan,
		mockTracer,
	};
});

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => mockLogger),
}));

vi.mock("../../telemetry", () => ({
	tracer: mockTracer,
}));

class TestLlm extends BaseLlm {
	public implResponses: LlmResponse[] = [];
	public lastStream: boolean | undefined;
	public lastRequest: LlmRequest | undefined;
	public throwOnImpl?: Error;

	constructor(model = "test-model") {
		super(model);
	}

	protected async *generateContentAsyncImpl(
		llmRequest: LlmRequest,
		stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
		this.lastRequest = llmRequest;
		this.lastStream = stream;
		if (this.throwOnImpl) {
			throw this.throwOnImpl;
		}
		for (const resp of this.implResponses) {
			yield resp;
		}
	}
}

async function collect(
	gen: AsyncGenerator<LlmResponse, void, unknown>,
): Promise<LlmResponse[]> {
	const out: LlmResponse[] = [];
	for await (const item of gen) {
		out.push(item);
	}
	return out;
}

function firstRequestAttrs(): Record<string, unknown> {
	expect(mockSetAttributes).toHaveBeenCalled();
	return mockSetAttributes.mock.calls[0][0] as Record<string, unknown>;
}

function parseLlmRequestAttr(
	attrs: Record<string, unknown>,
): Record<string, unknown> {
	return JSON.parse(String(attrs["adk.llm_request"])) as Record<
		string,
		unknown
	>;
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
			const req: any = {
				contents: [{ role: "model", parts: [{ text: "ok" }] }],
			};
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(2);
			expect(req.contents[1].role).toBe("user");
			expect(req.contents[1].parts[0].text).toBe(
				"Continue processing previous requests as instructed. Exit or provide a summary if no more outputs are needed.",
			);
		});

		it("should not append if last role is user", () => {
			const req: any = {
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			};
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(1);
			expect(req.contents[0].parts[0].text).toBe("hi");
		});
	});

	describe("generateContentAsync", () => {
		it("calls maybeAppendUserContent before the span and impl", async () => {
			const req: LlmRequest = {
				contents: [],
			} as LlmRequest;
			llm.implResponses = [{ content: { parts: [{ text: "done" }] } } as any];

			const results = await collect(llm.generateContentAsync(req));

			expect(req.contents).toHaveLength(1);
			expect(req.contents[0].role).toBe("user");
			expect(llm.lastRequest).toBe(req);
			expect(results).toHaveLength(1);
			expect(results[0].content).toEqual({ parts: [{ text: "done" }] });
		});

		it("opens a span named llm_generate with the model", async () => {
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;
			await collect(llm.generateContentAsync(req));

			expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
				"llm_generate [test-model]",
				expect.any(Function),
			);
		});

		it("sets baseline gen_ai and adk span attributes with config defaults", async () => {
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;
			await collect(llm.generateContentAsync(req));

			const attrs = firstRequestAttrs();
			expect(attrs["gen_ai.system.name"]).toBe("iqai-adk");
			expect(attrs["gen_ai.operation.name"]).toBe("generate");
			expect(attrs["gen_ai.request.model"]).toBe("test-model");
			expect(attrs["gen_ai.request.max_tokens"]).toBe(0);
			expect(attrs["gen_ai.request.temperature"]).toBe(0);
			expect(attrs["gen_ai.request.top_p"]).toBe(0);
			expect(attrs["adk.streaming"]).toBe(false);
		});

		it("reads maxOutputTokens, temperature, and topP from config", async () => {
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
				config: {
					maxOutputTokens: 128,
					temperature: 0.4,
					topP: 0.9,
				},
			} as LlmRequest;
			await collect(llm.generateContentAsync(req));

			const attrs = firstRequestAttrs();
			expect(attrs["gen_ai.request.max_tokens"]).toBe(128);
			expect(attrs["gen_ai.request.temperature"]).toBe(0.4);
			expect(attrs["gen_ai.request.top_p"]).toBe(0.9);
		});

		it("treats stream=true as adk.streaming true and forwards stream to impl", async () => {
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;
			await collect(llm.generateContentAsync(req, true));

			expect(firstRequestAttrs()["adk.streaming"]).toBe(true);
			expect(llm.lastStream).toBe(true);
		});

		it("treats omitted stream as false for adk.streaming and passes undefined to impl", async () => {
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;
			await collect(llm.generateContentAsync(req));

			expect(firstRequestAttrs()["adk.streaming"]).toBe(false);
			expect(llm.lastStream).toBeUndefined();
		});

		it("serializes contents roles and short text parts without truncation marker", async () => {
			const short = "a".repeat(200);
			const req: LlmRequest = {
				contents: [
					{ role: "user", parts: [{ text: short }] },
					{ role: "model", parts: [{ text: "reply" }] },
				],
			} as LlmRequest;
			llm["maybeAppendUserContent"] = vi.fn();

			await collect(llm.generateContentAsync(req));

			const serialized = parseLlmRequestAttr(firstRequestAttrs());
			expect(serialized.model).toBe("test-model");
			expect(serialized.contents).toEqual([
				{ role: "user", parts: [{ text: short }] },
				{ role: "model", parts: [{ text: "reply" }] },
			]);
			expect(serialized.config).toBeUndefined();
		});

		it("truncates text parts longer than 200 chars with ellipsis", async () => {
			const long = "b".repeat(201);
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: long }] }],
			} as LlmRequest;

			await collect(llm.generateContentAsync(req));

			const serialized = parseLlmRequestAttr(firstRequestAttrs());
			const parts = (serialized.contents as any[])[0].parts;
			expect(parts[0].text).toBe(`${"b".repeat(200)}...`);
			expect(parts[0].text.length).toBe(203);
		});

		it("maps non-string part.text to [non_text_content]", async () => {
			const req: LlmRequest = {
				contents: [
					{
						role: "user",
						parts: [{ text: 42 as any }, { inlineData: { data: "x" } } as any],
					},
				],
			} as LlmRequest;

			await collect(llm.generateContentAsync(req));

			const serialized = parseLlmRequestAttr(firstRequestAttrs());
			const parts = (serialized.contents as any[])[0].parts;
			expect(parts).toEqual([
				{ text: "[non_text_content]" },
				{ text: "[non_text_content]" },
			]);
		});

		it("serializes undefined contents when maybeAppendUserContent is skipped", async () => {
			const req = { contents: undefined, config: { temperature: 1 } } as any;
			llm["maybeAppendUserContent"] = vi.fn();

			await collect(llm.generateContentAsync(req));

			const serialized = parseLlmRequestAttr(firstRequestAttrs());
			expect(serialized.contents).toBeUndefined();
			expect(serialized.config).toEqual({ temperature: 1 });
		});

		it("includes config object in the serialized llm_request attribute", async () => {
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
				config: { systemInstruction: "be brief", temperature: 0.2 },
			} as LlmRequest;

			await collect(llm.generateContentAsync(req));

			const serialized = parseLlmRequestAttr(firstRequestAttrs());
			expect(serialized.config).toEqual({
				systemInstruction: "be brief",
				temperature: 0.2,
			});
		});

		it("yields every impl response unchanged", async () => {
			const r1 = { content: { parts: [{ text: "one" }] } } as LlmResponse;
			const r2 = {
				content: { parts: [{ text: "two" }] },
				partial: true,
			} as LlmResponse;
			llm.implResponses = [r1, r2];
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;

			const results = await collect(llm.generateContentAsync(req, true));
			expect(results).toEqual([r1, r2]);
		});

		it("sets usage and finish_reason attributes when response has usage", async () => {
			llm.implResponses = [
				{
					finish_reason: "STOP",
					usage: {
						prompt_tokens: 3,
						completion_tokens: 5,
						total_tokens: 8,
					},
				} as any,
			];
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;

			await collect(llm.generateContentAsync(req));

			expect(mockSetAttributes).toHaveBeenCalledWith({
				"gen_ai.response.finish_reasons": ["STOP"],
				"gen_ai.usage.input_tokens": 3,
				"gen_ai.usage.output_tokens": 5,
				"gen_ai.usage.total_tokens": 8,
			});
			expect(mockSetAttributes).toHaveBeenCalledWith({
				"adk.response_count": 1,
				"adk.total_tokens": 8,
			});
		});

		it("defaults missing finish_reason to unknown and missing usage fields to 0", async () => {
			llm.implResponses = [
				{
					usage: {},
				} as any,
			];
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;

			await collect(llm.generateContentAsync(req));

			expect(mockSetAttributes).toHaveBeenCalledWith({
				"gen_ai.response.finish_reasons": ["unknown"],
				"gen_ai.usage.input_tokens": 0,
				"gen_ai.usage.output_tokens": 0,
				"gen_ai.usage.total_tokens": 0,
			});
			expect(mockSetAttributes).toHaveBeenCalledWith({
				"adk.response_count": 1,
				"adk.total_tokens": 0,
			});
		});

		it("accumulates total tokens across streamed responses with usage", async () => {
			llm.implResponses = [
				{ usage: { total_tokens: 4 } } as any,
				{ content: { parts: [{ text: "mid" }] } } as any,
				{ usage: { total_tokens: 6, prompt_tokens: 1 } } as any,
			];
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;

			const results = await collect(llm.generateContentAsync(req, true));
			expect(results).toHaveLength(3);

			expect(mockSetAttributes).toHaveBeenCalledWith({
				"adk.response_count": 3,
				"adk.total_tokens": 10,
			});
		});

		it("skips mid-stream usage attrs when response has no usage but still counts response", async () => {
			llm.implResponses = [
				{ content: { parts: [{ text: "a" }] } } as any,
				{ content: { parts: [{ text: "b" }] } } as any,
			];
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;

			await collect(llm.generateContentAsync(req));

			const usageCalls = mockSetAttributes.mock.calls.filter(
				([attrs]) =>
					attrs &&
					Object.prototype.hasOwnProperty.call(
						attrs,
						"gen_ai.usage.total_tokens",
					),
			);
			expect(usageCalls).toHaveLength(0);
			expect(mockSetAttributes).toHaveBeenCalledWith({
				"adk.response_count": 2,
				"adk.total_tokens": 0,
			});
		});

		it("records exception, sets error status, logs, rethrows, and ends span", async () => {
			const boom = new Error("provider down");
			llm.throwOnImpl = boom;
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;

			await expect(collect(llm.generateContentAsync(req))).rejects.toThrow(
				"provider down",
			);

			expect(mockRecordException).toHaveBeenCalledWith(boom);
			expect(mockSetStatus).toHaveBeenCalledWith({
				code: 2,
				message: "provider down",
			});
			expect(mockLogger.error).toHaveBeenCalledWith("❌ ADK LLM Error:", {
				model: "test-model",
				error: "provider down",
			});
			expect(mockEnd).toHaveBeenCalledTimes(1);
		});

		it("ends the span after a successful generation", async () => {
			llm.implResponses = [{ content: { parts: [{ text: "ok" }] } } as any];
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;

			await collect(llm.generateContentAsync(req));
			expect(mockEnd).toHaveBeenCalledTimes(1);
		});

		it("uses the instance model name in span title and logger for custom models", async () => {
			const custom = new TestLlm("gemini-2.5-flash");
			custom.throwOnImpl = new Error("quota");
			const req: LlmRequest = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;

			await expect(collect(custom.generateContentAsync(req))).rejects.toThrow(
				"quota",
			);

			expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
				"llm_generate [gemini-2.5-flash]",
				expect.any(Function),
			);
			expect(mockLogger.error).toHaveBeenCalledWith("❌ ADK LLM Error:", {
				model: "gemini-2.5-flash",
				error: "quota",
			});
		});
	});

	describe("connect", () => {
		it("should throw error", () => {
			expect(() => llm.connect({} as any)).toThrow(
				"Live connection is not supported for test-model.",
			);
		});

		it("includes the concrete model name in the connect error", () => {
			const custom = new TestLlm("gpt-4o");
			expect(() => custom.connect({} as any)).toThrow(
				"Live connection is not supported for gpt-4o.",
			);
		});
	});
});
