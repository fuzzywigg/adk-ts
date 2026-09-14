import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: {
			completions: {
				create: vi.fn(),
			},
		},
	})),
}));

describe("OpenAiLlm leftover edges (overnight TOKENMAXX post #150)", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;
	let mockCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		mockCreate = vi.fn();
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		}));
		llm = new OpenAiLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	function baseRequest(overrides: Record<string, unknown> = {}) {
		return new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
			...overrides,
		});
	}

	async function drain(
		gen: AsyncGenerator<LlmResponse, void, unknown>,
	): Promise<LlmResponse[]> {
		const out: LlmResponse[] = [];
		for await (const item of gen) {
			out.push(item);
		}
		return out;
	}

	it("empty functionDeclarations array still sends tools:[] with tool_choice auto", async () => {
		mockCreate.mockResolvedValue({
			choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
		});

		await drain(
			(llm as any).generateContentAsyncImpl(
				baseRequest({
					config: { tools: [{ functionDeclarations: [] }] },
				}),
				false,
			),
		);

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: [],
				tool_choice: "auto",
			}),
		);
	});

	it("tools[0] without functionDeclarations omits tools and tool_choice", async () => {
		mockCreate.mockResolvedValue({
			choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
		});

		await drain(
			(llm as any).generateContentAsyncImpl(
				baseRequest({
					config: { tools: [{ googleSearch: {} }] },
				}),
				false,
			),
		);

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: undefined,
				tool_choice: undefined,
			}),
		);
	});

	it("mixed functionCall and functionResponse prefers assistant tool-call path", () => {
		const message = (llm as any).contentToOpenAiMessage({
			role: "model",
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

		expect(message).toEqual({
			role: "assistant",
			tool_calls: [
				{
					id: "c1",
					type: "function",
					function: {
						name: "fn",
						arguments: JSON.stringify({ a: 1 }),
					},
				},
			],
		});
	});

	it("multiple functionCall parts serialize only the first", () => {
		const message = (llm as any).contentToOpenAiMessage({
			role: "model",
			parts: [
				{
					functionCall: {
						id: "first",
						name: "alpha",
						args: { n: 1 },
					},
				},
				{
					functionCall: {
						id: "second",
						name: "beta",
						args: { n: 2 },
					},
				},
			],
		});

		expect(message.tool_calls).toHaveLength(1);
		expect(message.tool_calls[0].function.name).toBe("alpha");
	});

	it("stream finish_reason with no text and no named tool calls yields empty parts", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "orphan",
										type: "function",
										function: { arguments: "{}" },
									},
								],
							},
							finish_reason: "stop",
						},
					],
					usage: {
						prompt_tokens: 1,
						completion_tokens: 1,
						total_tokens: 2,
					},
				};
			})(),
		);

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), true),
		);
		const finished = responses.find((r) => r.finishReason === "STOP");
		expect(finished?.content?.parts).toEqual([]);
		expect(finished?.usageMetadata?.totalTokenCount).toBe(2);
	});

	it("non-stream null content with tool_calls still builds functionCall parts", async () => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: {
						content: null,
						tool_calls: [
							{
								id: "t1",
								type: "function",
								function: { name: "lookup", arguments: '{"q":"x"}' },
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
			usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), false),
		);

		expect(responses).toHaveLength(1);
		expect(responses[0].content?.parts).toEqual([
			{
				functionCall: { id: "t1", name: "lookup", args: { q: "x" } },
			},
		]);
		expect(responses[0].finishReason).toBe("STOP");
	});

	it.each([
		{ reason: "content_filter", expected: "FINISH_REASON_UNSPECIFIED" },
		{ reason: "weird_reason", expected: "FINISH_REASON_UNSPECIFIED" },
		{ reason: "length", expected: "MAX_TOKENS" },
	])("wire-through finish_reason $reason maps to $expected", async ({
		reason,
		expected,
	}) => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: { content: "x" },
					finish_reason: reason,
				},
			],
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), false),
		);
		expect(responses[0].finishReason).toBe(expected);
	});

	it("partToOpenAiContent prefers text over sibling inline_data on same part", () => {
		const part = (llm as any).partToOpenAiContent({
			text: "caption",
			inline_data: { mime_type: "image/png", data: "abc" },
		});
		expect(part).toEqual({ type: "text", text: "caption" });
	});

	it("merges buffered text when next chunk has empty parts and no inlineData", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: { content: "hello" },
							finish_reason: null,
						},
					],
				};
				yield {
					choices: [
						{
							delta: {},
							finish_reason: null,
						},
					],
					usage: {
						prompt_tokens: 1,
						completion_tokens: 1,
						total_tokens: 2,
					},
				};
			})(),
		);

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), true),
		);

		const merged = responses.find(
			(r) =>
				!r.partial &&
				!r.finishReason &&
				r.content?.parts?.[0]?.text === "hello" &&
				r.usageMetadata?.totalTokenCount === 2,
		);
		expect(merged).toBeTruthy();
	});

	it("malformed stream tool arguments throw through generate path", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "bad",
										type: "function",
										function: { name: "broken", arguments: "{not-json" },
									},
								],
							},
							finish_reason: "tool_calls",
						},
					],
				};
			})(),
		);

		await expect(
			drain((llm as any).generateContentAsyncImpl(baseRequest(), true)),
		).rejects.toThrow();
	});

	it("system role content uses first part text or empty string", () => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "system",
				parts: [{ text: "sys" }],
			}),
		).toEqual({ role: "system", content: "sys" });

		expect(
			(llm as any).contentToOpenAiMessage({
				role: "system",
				parts: [],
			}),
		).toEqual({ role: "system", content: "" });
	});

	it("multi-part user content maps via partToOpenAiContent including image_url", () => {
		const message = (llm as any).contentToOpenAiMessage({
			role: "user",
			parts: [
				{ text: "see" },
				{ inline_data: { mime_type: "image/jpeg", data: "zzz" } },
			],
		});
		expect(message.role).toBe("user");
		expect(message.content).toEqual([
			{ type: "text", text: "see" },
			{
				type: "image_url",
				image_url: { url: "data:image/jpeg;base64,zzz" },
			},
		]);
	});

	it("preprocessRequest clears labels and drops invalid inline_data", () => {
		const req = baseRequest({
			config: {
				labels: { env: "test" },
			},
			contents: [
				{
					role: "user",
					parts: [
						{ text: "a", inline_data: { mime_type: "image/png" } },
						{ text: "b", inline_data: { data: "only-data" } },
						{
							text: "c",
							inline_data: { mime_type: "image/png", data: "ok" },
						},
					],
				},
			],
		});

		(llm as any).preprocessRequest(req);

		expect((req.config as any).labels).toBeUndefined();
		expect(req.contents?.[0].parts?.[0].inline_data).toBeUndefined();
		expect(req.contents?.[0].parts?.[1].inline_data).toBeUndefined();
		expect(req.contents?.[0].parts?.[2].inline_data).toEqual({
			mime_type: "image/png",
			data: "ok",
		});
	});

	it("supportedModels includes gpt and o-series patterns", () => {
		expect(OpenAiLlm.supportedModels()).toEqual(
			expect.arrayContaining([
				"gpt-3.5-.*",
				"gpt-4.*",
				"gpt-4o.*",
				"gpt-5.*",
				"o1-.*",
				"o3-.*",
			]),
		);
	});

	it("createChunkResponse leaves content undefined when delta has neither text nor named tools", () => {
		const response = (llm as any).createChunkResponse({
			tool_calls: [{ type: "function", function: { arguments: "{}" } }],
		});
		expect(response.content).toBeUndefined();
	});

	it("transformSchemaForOpenAi lowercases nested property and items types", () => {
		const transformed = (llm as any).transformSchemaForOpenAi({
			type: "OBJECT",
			properties: {
				items: {
					type: "ARRAY",
					items: { type: "STRING" },
				},
			},
			anyOf: [{ type: "NUMBER" }, { type: "NULL" }],
		});
		expect(transformed.type).toBe("object");
		expect(transformed.properties.items.type).toBe("array");
		expect(transformed.properties.items.items.type).toBe("string");
		expect(transformed.anyOf[0].type).toBe("number");
		expect(transformed.anyOf[1].type).toBe("null");
	});
});
