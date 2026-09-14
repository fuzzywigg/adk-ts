import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

const generateText = vi.fn();
const streamText = vi.fn();
const jsonSchema = vi.fn((schema: unknown) => ({ schema }));

vi.mock("ai", () => ({
	generateText: (...args: unknown[]) => generateText(...args),
	streamText: (...args: unknown[]) => streamText(...args),
	jsonSchema: (...args: unknown[]) => jsonSchema(...args),
}));

function makeAiModel(modelId = "mock-model"): LanguageModel {
	return {
		modelId,
		provider: "mock",
		specificationVersion: "v2",
	} as unknown as LanguageModel;
}

describe("AiSdkLlm leftover edges (overnight TOKENMAXX post #142)", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		jsonSchema.mockImplementation((schema: unknown) => ({ schema }));
		llm = new AiSdkLlm(makeAiModel("leftover-model"));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	async function drain(
		gen: AsyncGenerator<LlmResponse, void, unknown>,
	): Promise<LlmResponse[]> {
		const out: LlmResponse[] = [];
		for await (const item of gen) {
			out.push(item);
		}
		return out;
	}

	function baseRequest(overrides: Record<string, unknown> = {}) {
		return new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
			...overrides,
		});
	}

	it("stream final with toolCalls only and no text deltas omits blank text part", async () => {
		streamText.mockReturnValue({
			textStream: (async function* () {
				/* no deltas */
			})(),
			toolCalls: Promise.resolve([
				{
					toolCallId: "tc-1",
					toolName: "lookup",
					input: { q: "x" },
				},
			]),
			usage: Promise.resolve({
				inputTokens: 1,
				outputTokens: 2,
				totalTokens: 3,
			}),
			finishReason: Promise.resolve("stop"),
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), true),
		);

		expect(responses).toHaveLength(1);
		expect(responses[0].partial).toBeUndefined();
		expect(responses[0].content?.parts).toEqual([
			{
				functionCall: {
					id: "tc-1",
					name: "lookup",
					args: { q: "x" },
				},
			},
		]);
		expect(responses[0].turnComplete).toBe(true);
	});

	it("mid-stream textStream rejection yields AI_SDK_ERROR after prior partials", async () => {
		streamText.mockReturnValue({
			textStream: (async function* () {
				yield "hello";
				throw new Error("stream boom");
			})(),
			toolCalls: Promise.resolve([]),
			usage: Promise.resolve(undefined),
			finishReason: Promise.resolve("stop"),
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), true),
		);

		expect(responses.length).toBeGreaterThanOrEqual(2);
		expect(responses[0].partial).toBe(true);
		expect(responses[0].content?.parts?.[0]).toEqual({ text: "hello" });
		const err = responses[responses.length - 1];
		expect(err.errorCode).toBe("AI_SDK_ERROR");
		expect(err.errorMessage).toMatch(/stream boom/);
	});

	it("generateText rejection with non-Error value still yields AI_SDK_ERROR", async () => {
		generateText.mockRejectedValue("plain failure");

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), false),
		);

		expect(responses).toHaveLength(1);
		expect(responses[0].errorCode).toBe("AI_SDK_ERROR");
		expect(responses[0].errorMessage).toMatch(/plain failure/);
		expect(responses[0].content?.parts?.[0]?.text).toMatch(/plain failure/);
	});

	it("mixed functionCall and functionResponse prefers assistant tool-call path", () => {
		const message = (llm as any).contentToAiSdkMessage({
			role: "assistant",
			parts: [
				{ text: "calling" },
				{
					functionCall: {
						id: "c1",
						name: "fn",
						args: { a: 1 },
					},
				},
				{
					functionResponse: {
						id: "c1",
						name: "fn",
						response: { ok: true },
					},
				},
			],
		});

		expect(message.role).toBe("assistant");
		expect(message.content).toEqual([
			{ type: "text", text: "calling" },
			{
				type: "tool-call",
				toolCallId: "c1",
				toolName: "fn",
				input: { a: 1 },
			},
		]);
	});

	it("functionCall-only parts without text still emit tool-call assistant message", () => {
		const message = (llm as any).contentToAiSdkMessage({
			role: "model",
			parts: [
				{
					functionCall: {
						id: "only",
						name: "solo",
						args: {},
					},
				},
			],
		});

		expect(message).toEqual({
			role: "assistant",
			content: [
				{
					type: "tool-call",
					toolCallId: "only",
					toolName: "solo",
					input: {},
				},
			],
		});
	});

	it("functionResponse with undefined response uses json null output", () => {
		const message = (llm as any).contentToAiSdkMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: "r1",
						name: "tool",
						response: undefined,
					},
				},
			],
		});

		expect(message).toEqual({
			role: "tool",
			content: [
				{
					type: "tool-result",
					toolCallId: "r1",
					toolName: "tool",
					output: { type: "json", value: null },
				},
			],
		});
	});

	it("convertToAiSdkTools skips multiple tool configs lacking functionDeclarations", () => {
		const tools = (llm as any).convertToAiSdkTools(
			baseRequest({
				config: {
					tools: [
						{ googleSearch: {} },
						{
							functionDeclarations: [
								{
									name: "keep_me",
									description: "kept",
									parameters: { type: "OBJECT" },
								},
							],
						},
						{ codeExecution: {} },
					],
				},
			}),
		);

		expect(Object.keys(tools)).toEqual(["keep_me"]);
		expect(jsonSchema).toHaveBeenCalledWith({ type: "object" });
	});

	it("stream maps end_of_message finishReason to STOP", async () => {
		streamText.mockReturnValue({
			textStream: (async function* () {
				yield "done";
			})(),
			toolCalls: Promise.resolve([]),
			usage: Promise.resolve({
				inputTokens: 1,
				outputTokens: 1,
				totalTokens: 2,
			}),
			finishReason: Promise.resolve("end_of_message"),
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), true),
		);
		const final = responses[responses.length - 1];
		expect(final.finishReason).toBe("STOP");
		expect(final.turnComplete).toBe(true);
	});

	it("non-stream falsy usage omits usageMetadata even when text present", async () => {
		generateText.mockResolvedValue({
			text: "hello",
			toolCalls: [],
			usage: undefined,
			finishReason: "stop",
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), false),
		);

		expect(responses[0].content?.parts).toEqual([{ text: "hello" }]);
		expect(responses[0].usageMetadata).toBeUndefined();
	});

	it("transformSchemaForAiSdk leaves missing type/properties/items/composites unchanged", () => {
		const schema = { description: "x", title: "T" };
		expect((llm as any).transformSchemaForAiSdk(schema)).toEqual({
			description: "x",
			title: "T",
		});
	});

	it("stream maps length finishReason to MAX_TOKENS with usage", async () => {
		streamText.mockReturnValue({
			textStream: (async function* () {
				yield "partial";
			})(),
			toolCalls: Promise.resolve([]),
			usage: Promise.resolve({
				inputTokens: 4,
				outputTokens: 5,
				totalTokens: 9,
			}),
			finishReason: Promise.resolve("length"),
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), true),
		);
		const final = responses[responses.length - 1];
		expect(final.finishReason).toBe("MAX_TOKENS");
		expect(final.usageMetadata).toEqual({
			promptTokenCount: 4,
			candidatesTokenCount: 5,
			totalTokenCount: 9,
		});
	});

	it("non-stream empty parts fallback when text and toolCalls are both empty", async () => {
		generateText.mockResolvedValue({
			text: "",
			toolCalls: [],
			usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
			finishReason: "stop",
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), false),
		);

		expect(responses[0].content?.parts).toEqual([{ text: "" }]);
	});
});
