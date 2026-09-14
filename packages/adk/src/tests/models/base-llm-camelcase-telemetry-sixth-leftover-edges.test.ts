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

	constructor(model = "telemetry-model") {
		super(model);
	}

	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
		_stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
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

function finalCountAttrs(): Record<string, unknown> {
	const calls = mockSetAttributes.mock.calls.map(
		(c) => c[0] as Record<string, unknown>,
	);
	const countCall = calls.find((attrs) => "adk.response_count" in attrs);
	expect(countCall).toBeDefined();
	return countCall as Record<string, unknown>;
}

describe("BaseLlm camelCase telemetry sixth leftover edges (post #150/#151)", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm("telemetry-model");
	});

	it("provider-shaped camelCase usageMetadata/finishReason never updates span usage attrs", async () => {
		llm.implResponses = [
			{
				content: { role: "model", parts: [{ text: "ok" }] },
				finishReason: "STOP",
				usageMetadata: {
					promptTokenCount: 3,
					candidatesTokenCount: 6,
					totalTokenCount: 9,
				},
			} as LlmResponse,
		];

		await collect(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);

		expect(finalCountAttrs()).toEqual({
			"adk.response_count": 1,
			"adk.total_tokens": 0,
		});

		const usageAttrCalls = mockSetAttributes.mock.calls.filter((c) =>
			Object.hasOwn(c[0] as object, "gen_ai.usage.total_tokens"),
		);
		expect(usageAttrCalls).toHaveLength(0);
	});

	it("snake_case usage control still accumulates while camelCase sibling is ignored", async () => {
		llm.implResponses = [
			{
				content: { role: "model", parts: [{ text: "a" }] },
				finishReason: "STOP",
				usageMetadata: {
					promptTokenCount: 10,
					candidatesTokenCount: 20,
					totalTokenCount: 30,
				},
			} as LlmResponse,
			{
				content: { role: "model", parts: [{ text: "b" }] },
				usage: {
					prompt_tokens: 1,
					completion_tokens: 2,
					total_tokens: 3,
				},
				finish_reason: "stop",
			} as LlmResponse,
		];

		await collect(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);

		expect(finalCountAttrs()).toEqual({
			"adk.response_count": 2,
			"adk.total_tokens": 3,
		});

		expect(mockSetAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				"gen_ai.response.finish_reasons": ["stop"],
				"gen_ai.usage.input_tokens": 1,
				"gen_ai.usage.output_tokens": 2,
				"gen_ai.usage.total_tokens": 3,
			}),
		);
	});

	it("snake_case usage with missing finish_reason defaults finish_reasons to unknown", async () => {
		llm.implResponses = [
			{
				content: { role: "model", parts: [{ text: "x" }] },
				usage: {
					prompt_tokens: 2,
					completion_tokens: 0,
					total_tokens: 2,
				},
			} as LlmResponse,
		];

		await collect(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);

		expect(mockSetAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				"gen_ai.response.finish_reasons": ["unknown"],
				"gen_ai.usage.total_tokens": 2,
			}),
		);
		expect(finalCountAttrs()["adk.total_tokens"]).toBe(2);
	});

	it("falsy snake_case token fields coalesce to 0 without skipping the usage branch", async () => {
		llm.implResponses = [
			{
				content: { role: "model", parts: [{ text: "z" }] },
				usage: {
					prompt_tokens: 0,
					completion_tokens: undefined,
					total_tokens: 0,
				},
				finish_reason: "",
			} as LlmResponse,
		];

		await collect(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);

		expect(mockSetAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				"gen_ai.response.finish_reasons": ["unknown"],
				"gen_ai.usage.input_tokens": 0,
				"gen_ai.usage.output_tokens": 0,
				"gen_ai.usage.total_tokens": 0,
			}),
		);
		expect(finalCountAttrs()).toEqual({
			"adk.response_count": 1,
			"adk.total_tokens": 0,
		});
	});
});
