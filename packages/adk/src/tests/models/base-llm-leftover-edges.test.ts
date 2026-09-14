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

	constructor(model = "leftover-model") {
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

describe("BaseLlm leftover edges (post #144)", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		mockTracer.startActiveSpan.mockImplementation(
			(_name: string, fn: (span: typeof mockSpan) => unknown) => fn(mockSpan),
		);
		llm = new TestLlm();
	});

	describe("maybeAppendUserContent matrix", () => {
		it.each([
			{
				label: "undefined contents",
				req: {} as any,
				expectedText:
					"Handle the requests as specified in the System Instruction.",
				expectedLength: 1,
			},
			{
				label: "null contents coalesced via || []",
				req: { contents: null } as any,
				expectedText:
					"Handle the requests as specified in the System Instruction.",
				expectedLength: 1,
			},
			{
				label: "empty contents",
				req: { contents: [] } as any,
				expectedText:
					"Handle the requests as specified in the System Instruction.",
				expectedLength: 1,
			},
		])("$label inserts system-instruction hint", ({
			req,
			expectedText,
			expectedLength,
		}) => {
			(llm as any).maybeAppendUserContent(req);
			expect(req.contents).toHaveLength(expectedLength);
			expect(req.contents[0]).toEqual({
				role: "user",
				parts: [{ text: expectedText }],
			});
		});

		it.each([
			{ lastRole: "model" },
			{ lastRole: "assistant" },
			{ lastRole: "system" },
			{ lastRole: undefined },
		])("appends continue hint when last role is $lastRole", ({ lastRole }) => {
			const req: any = {
				contents: [{ role: lastRole, parts: [{ text: "prior" }] }],
			};
			(llm as any).maybeAppendUserContent(req);
			expect(req.contents).toHaveLength(2);
			expect(req.contents[1].role).toBe("user");
			expect(req.contents[1].parts[0].text).toMatch(/Continue processing/);
		});

		it("does not append when last role is already user", () => {
			const req: any = {
				contents: [
					{ role: "model", parts: [{ text: "a" }] },
					{ role: "user", parts: [{ text: "b" }] },
				],
			};
			(llm as any).maybeAppendUserContent(req);
			expect(req.contents).toHaveLength(2);
			expect(req.contents[1].parts[0].text).toBe("b");
		});
	});

	describe("generateContentAsync span leftover matrix", () => {
		it.each([
			{
				label: "stream omitted",
				stream: undefined,
				expectedStreamingAttr: false,
				expectedLastStream: undefined,
			},
			{
				label: "stream false",
				stream: false,
				expectedStreamingAttr: false,
				expectedLastStream: false,
			},
			{
				label: "stream true",
				stream: true,
				expectedStreamingAttr: true,
				expectedLastStream: true,
			},
		])("$label", async ({
			stream,
			expectedStreamingAttr,
			expectedLastStream,
		}) => {
			llm.implResponses = [{ content: { parts: [{ text: "ok" }] } } as any];
			const req = {
				contents: [{ role: "user", parts: [{ text: "ping" }] }],
			} as LlmRequest;
			await collect(llm.generateContentAsync(req, stream as any));
			expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
				"llm_generate [leftover-model]",
				expect.any(Function),
			);
			expect(mockSetAttributes.mock.calls[0][0]["adk.streaming"]).toBe(
				expectedStreamingAttr,
			);
			expect(llm.lastStream).toBe(expectedLastStream);
		});

		it("ignores usageMetadata-shaped responses for span usage attrs", async () => {
			llm.implResponses = [
				{
					finishReason: "STOP",
					usageMetadata: {
						promptTokenCount: 9,
						candidatesTokenCount: 8,
						totalTokenCount: 17,
					},
				} as any,
			];
			await collect(
				llm.generateContentAsync({
					contents: [{ role: "user", parts: [{ text: "ping" }] }],
				} as LlmRequest),
			);

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
				"adk.response_count": 1,
				"adk.total_tokens": 0,
			});
		});

		it.each([
			{
				label: "missing finish_reason defaults unknown",
				response: { usage: { total_tokens: 4 } },
				expectedFinish: ["unknown"],
				expectedTotal: 4,
			},
			{
				label: "empty usage fields default to 0",
				response: { finish_reason: "STOP", usage: {} },
				expectedFinish: ["STOP"],
				expectedTotal: 0,
			},
			{
				label: "full usage fields",
				response: {
					finish_reason: "MAX_TOKENS",
					usage: {
						prompt_tokens: 2,
						completion_tokens: 3,
						total_tokens: 5,
					},
				},
				expectedFinish: ["MAX_TOKENS"],
				expectedTotal: 5,
			},
		])("$label", async ({ response, expectedFinish, expectedTotal }) => {
			llm.implResponses = [response as any];
			await collect(
				llm.generateContentAsync({
					contents: [{ role: "user", parts: [{ text: "ping" }] }],
				} as LlmRequest),
			);
			expect(mockSetAttributes).toHaveBeenCalledWith({
				"gen_ai.response.finish_reasons": expectedFinish,
				"gen_ai.usage.input_tokens": (response as any).usage.prompt_tokens || 0,
				"gen_ai.usage.output_tokens":
					(response as any).usage.completion_tokens || 0,
				"gen_ai.usage.total_tokens": (response as any).usage.total_tokens || 0,
			});
			expect(mockSetAttributes).toHaveBeenCalledWith({
				"adk.response_count": 1,
				"adk.total_tokens": expectedTotal,
			});
		});

		it("records exception, logs, and rethrows from impl", async () => {
			llm.throwOnImpl = new Error("impl-fail");
			await expect(
				collect(
					llm.generateContentAsync({
						contents: [{ role: "user", parts: [{ text: "ping" }] }],
					} as LlmRequest),
				),
			).rejects.toThrow("impl-fail");
			expect(mockRecordException).toHaveBeenCalled();
			expect(mockSetStatus).toHaveBeenCalledWith({
				code: 2,
				message: "impl-fail",
			});
			expect(mockLogger.error).toHaveBeenCalledWith(
				"❌ ADK LLM Error:",
				expect.objectContaining({
					model: "leftover-model",
					error: "impl-fail",
				}),
			);
			expect(mockEnd).toHaveBeenCalled();
		});

		it("truncates long text and maps non-string parts in span serialization", async () => {
			const long = "z".repeat(250);
			await collect(
				llm.generateContentAsync({
					contents: [
						{
							role: "user",
							parts: [{ text: long }, { text: 99 as any }],
						},
					],
				} as LlmRequest),
			);
			const attrs = mockSetAttributes.mock.calls[0][0];
			const serialized = JSON.parse(String(attrs["adk.llm_request"]));
			expect(serialized.contents[0].parts[0].text).toBe(
				`${"z".repeat(200)}...`,
			);
			expect(serialized.contents[0].parts[1].text).toBe("[non_text_content]");
		});
	});

	it("connect throws with concrete model name", () => {
		expect(() => new TestLlm("named-model").connect({} as LlmRequest)).toThrow(
			"Live connection is not supported for named-model.",
		);
	});

	it("supportedModels returns empty list on base class", () => {
		expect(BaseLlm.supportedModels()).toEqual([]);
	});
});
