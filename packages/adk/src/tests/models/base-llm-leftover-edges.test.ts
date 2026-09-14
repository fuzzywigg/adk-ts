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
	public throwOnImpl?: unknown;

	constructor(model = "test-model") {
		super(model);
	}

	protected async *generateContentAsyncImpl(
		llmRequest: LlmRequest,
		stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
		this.lastRequest = llmRequest;
		this.lastStream = stream;
		if (this.throwOnImpl !== undefined) {
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

describe("BaseLlm leftover edges (overnight TOKENMAXX post #142)", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm("leftover-model");
	});

	it("maybeAppendUserContent coalesces null contents to system-instruction hint", async () => {
		const request = {
			contents: null,
			config: {},
		} as unknown as LlmRequest;

		await collect(llm.generateContentAsync(request));

		expect(request.contents).toEqual([
			{
				role: "user",
				parts: [
					{
						text: "Handle the requests as specified in the System Instruction.",
					},
				],
			},
		]);
	});

	it("maybeAppendUserContent appends continue hint when last role is assistant", async () => {
		const request = {
			contents: [{ role: "assistant", parts: [{ text: "prior" }] }],
			config: {},
		} as unknown as LlmRequest;

		await collect(llm.generateContentAsync(request));

		expect(request.contents?.[request.contents.length - 1]).toEqual({
			role: "user",
			parts: [
				{
					text: "Continue processing previous requests as instructed. Exit or provide a summary if no more outputs are needed.",
				},
			],
		});
	});

	it("generateContentAsync with stream=false sets adk.streaming false and forwards false", async () => {
		llm.implResponses = [
			{ content: { role: "model", parts: [{ text: "x" }] } } as LlmResponse,
		];

		await collect(
			llm.generateContentAsync(
				{ contents: [{ role: "user", parts: [{ text: "q" }] }] } as LlmRequest,
				false,
			),
		);

		expect(llm.lastStream).toBe(false);
		expect(firstRequestAttrs()["adk.streaming"]).toBe(false);
	});

	it("serializes content entries whose parts are undefined without throwing", async () => {
		llm.implResponses = [];
		await collect(
			llm.generateContentAsync({
				contents: [{ role: "user" }],
			} as LlmRequest),
		);

		const parsed = parseLlmRequestAttr(firstRequestAttrs());
		expect((parsed.contents as any[])[0]).toEqual({
			role: "user",
			parts: undefined,
		});
	});

	it("zero impl responses still ends span with response_count 0 and total_tokens 0", async () => {
		llm.implResponses = [];
		await collect(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);

		expect(mockSetAttributes).toHaveBeenCalledWith({
			"adk.response_count": 0,
			"adk.total_tokens": 0,
		});
		expect(mockEnd).toHaveBeenCalledTimes(1);
	});

	it("non-Error throw records exception and rethrows with undefined message status", async () => {
		llm.throwOnImpl = "boom";

		await expect(
			collect(
				llm.generateContentAsync({
					contents: [{ role: "user", parts: [{ text: "q" }] }],
				} as LlmRequest),
			),
		).rejects.toBe("boom");

		expect(mockRecordException).toHaveBeenCalledWith("boom");
		expect(mockSetStatus).toHaveBeenCalledWith({
			code: 2,
			message: undefined,
		});
		expect(mockLogger.error).toHaveBeenCalledWith("❌ ADK LLM Error:", {
			model: "leftover-model",
			error: undefined,
		});
		expect(mockEnd).toHaveBeenCalledTimes(1);
	});

	it("usage accumulation skips responses without usage then adds later totals", async () => {
		llm.implResponses = [
			{ content: { role: "model", parts: [{ text: "a" }] } } as LlmResponse,
			{
				content: { role: "model", parts: [{ text: "b" }] },
				usage: {
					prompt_tokens: 1,
					completion_tokens: 2,
					total_tokens: 3,
				},
			} as LlmResponse,
			{
				content: { role: "model", parts: [{ text: "c" }] },
				usage: {
					prompt_tokens: 4,
					completion_tokens: 5,
					total_tokens: 9,
				},
			} as LlmResponse,
		];

		await collect(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);

		expect(mockSetAttributes).toHaveBeenCalledWith({
			"adk.response_count": 3,
			"adk.total_tokens": 12,
		});
	});

	it("truncation boundary at exactly 201 chars adds ellipsis", async () => {
		const text = "x".repeat(201);
		llm.implResponses = [];
		await collect(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text }] }],
			} as LlmRequest),
		);

		const parsed = parseLlmRequestAttr(firstRequestAttrs());
		const partText = ((parsed.contents as any[])[0].parts as any[])[0].text;
		expect(partText).toBe(`${"x".repeat(200)}...`);
	});

	it("maybeAppendUserContent early-returns without double-append on already-user contents", async () => {
		const request = {
			contents: [
				{
					role: "user",
					parts: [
						{
							text: "Handle the requests as specified in the System Instruction.",
						},
					],
				},
			],
			config: {},
		} as unknown as LlmRequest;

		await collect(llm.generateContentAsync(request));
		expect(request.contents).toHaveLength(1);

		await collect(llm.generateContentAsync(request));
		expect(request.contents).toHaveLength(1);
	});

	it("connect error message interpolates the instance model name", () => {
		expect(() =>
			llm.connect({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		).toThrow(/Live connection is not supported for leftover-model/);
	});

	it("span attributes default missing config numeric fields to 0", async () => {
		llm.implResponses = [];
		await collect(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);

		const attrs = firstRequestAttrs();
		expect(attrs["gen_ai.request.max_tokens"]).toBe(0);
		expect(attrs["gen_ai.request.temperature"]).toBe(0);
		expect(attrs["gen_ai.request.top_p"]).toBe(0);
		expect(attrs["gen_ai.request.model"]).toBe("leftover-model");
	});
});
