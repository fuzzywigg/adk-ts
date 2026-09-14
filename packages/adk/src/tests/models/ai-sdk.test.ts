import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
import { LlmRequest } from "../../models/llm-request";

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

function makeModel(modelId = "mock-model"): LanguageModel {
	return {
		modelId,
		provider: "mock",
		specificationVersion: "v2",
	} as unknown as LanguageModel;
}

describe("AiSdkLlm", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new AiSdkLlm(makeModel());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("supportedModels returns an empty list", () => {
		expect(AiSdkLlm.supportedModels()).toEqual([]);
	});

	it("uses modelId from a LanguageModel instance", () => {
		expect(llm.model).toBe("mock-model");
	});

	it("falls back to ai-sdk-model when given a string instance", () => {
		const stringLlm = new AiSdkLlm("gpt-test" as unknown as LanguageModel);
		expect(stringLlm.model).toBe("ai-sdk-model");
	});

	describe("mapRole", () => {
		it("maps model/assistant/system/default roles", () => {
			expect((llm as any).mapRole("model")).toBe("assistant");
			expect((llm as any).mapRole("assistant")).toBe("assistant");
			expect((llm as any).mapRole("system")).toBe("system");
			expect((llm as any).mapRole("user")).toBe("user");
			expect((llm as any).mapRole(undefined)).toBe("user");
		});
	});

	describe("mapFinishReason", () => {
		it("maps stop and length families", () => {
			expect((llm as any).mapFinishReason("stop")).toBe("STOP");
			expect((llm as any).mapFinishReason("end_of_message")).toBe("STOP");
			expect((llm as any).mapFinishReason("length")).toBe("MAX_TOKENS");
			expect((llm as any).mapFinishReason("max_tokens")).toBe("MAX_TOKENS");
			expect((llm as any).mapFinishReason("other")).toBe(
				"FINISH_REASON_UNSPECIFIED",
			);
			expect((llm as any).mapFinishReason(undefined)).toBe(
				"FINISH_REASON_UNSPECIFIED",
			);
		});
	});

	describe("transformSchemaForAiSdk", () => {
		it("lowercases types and recurses into properties/items/composites", () => {
			const transformed = (llm as any).transformSchemaForAiSdk({
				type: "OBJECT",
				properties: {
					name: { type: "STRING" },
					tags: {
						type: "ARRAY",
						items: { type: "STRING" },
					},
				},
				anyOf: [{ type: "NUMBER" }],
				oneOf: [{ type: "BOOLEAN" }],
				allOf: [{ type: "INTEGER" }],
			});

			expect(transformed.type).toBe("object");
			expect(transformed.properties.name.type).toBe("string");
			expect(transformed.properties.tags.type).toBe("array");
			expect(transformed.properties.tags.items.type).toBe("string");
			expect(transformed.anyOf[0].type).toBe("number");
			expect(transformed.oneOf[0].type).toBe("boolean");
			expect(transformed.allOf[0].type).toBe("integer");
		});

		it("passes through arrays, nulls, and primitives", () => {
			expect(
				(llm as any).transformSchemaForAiSdk([{ type: "STRING" }]),
			).toEqual([{ type: "string" }]);
			expect((llm as any).transformSchemaForAiSdk(null)).toBeNull();
			expect((llm as any).transformSchemaForAiSdk("raw")).toBe("raw");
		});
	});

	describe("convertToAiSdkTools", () => {
		it("builds tools from functionDeclarations", () => {
			const request = new LlmRequest({
				config: {
					tools: [
						{
							functionDeclarations: [
								{
									name: "search",
									description: "Search docs",
									parameters: {
										type: "OBJECT",
										properties: { q: { type: "STRING" } },
									},
								},
							],
						},
					],
				},
			});

			const tools = (llm as any).convertToAiSdkTools(request);
			expect(Object.keys(tools)).toEqual(["search"]);
			expect(tools.search.description).toBe("Search docs");
			expect(jsonSchema).toHaveBeenCalledWith({
				type: "object",
				properties: { q: { type: "string" } },
			});
		});

		it("returns an empty object when no tools are configured", () => {
			expect((llm as any).convertToAiSdkTools(new LlmRequest())).toEqual({});
		});

		it("ignores tool configs without functionDeclarations", () => {
			const request = new LlmRequest({
				config: {
					tools: [
						{ googleSearchRetrieval: {} } as any,
						{
							functionDeclarations: [
								{
									name: "keep",
									description: "Keep me",
									parameters: {},
								},
							],
						},
					],
				},
			});

			const tools = (llm as any).convertToAiSdkTools(request);
			expect(Object.keys(tools)).toEqual(["keep"]);
			expect(jsonSchema).toHaveBeenCalledWith({});
		});

		it("uses empty object when parameters are missing", () => {
			const request = new LlmRequest({
				config: {
					tools: [
						{
							functionDeclarations: [
								{
									name: "bare",
									description: "No params",
								},
							],
						},
					],
				},
			});

			(llm as any).convertToAiSdkTools(request);
			expect(jsonSchema).toHaveBeenCalledWith({});
		});
	});

	describe("contentToAiSdkMessage", () => {
		it("returns null for empty parts", () => {
			expect(
				(llm as any).contentToAiSdkMessage({ role: "user", parts: [] }),
			).toBeNull();
		});

		it("converts single-text user/system/assistant messages", () => {
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "user",
					parts: [{ text: "hi" }],
				}),
			).toEqual({ role: "user", content: "hi" });
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "system",
					parts: [{ text: "sys" }],
				}),
			).toEqual({ role: "system", content: "sys" });
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "model",
					parts: [{ text: "ok" }],
				}),
			).toEqual({ role: "assistant", content: "ok" });
		});

		it("converts function call parts into tool-call content", () => {
			const msg = (llm as any).contentToAiSdkMessage({
				role: "model",
				parts: [
					{ text: "calling" },
					{
						functionCall: {
							id: "c1",
							name: "search",
							args: { q: "adk" },
						},
					},
				],
			});
			expect(msg).toEqual({
				role: "assistant",
				content: [
					{ type: "text", text: "calling" },
					{
						type: "tool-call",
						toolCallId: "c1",
						toolName: "search",
						input: { q: "adk" },
					},
				],
			});
		});

		it("converts function responses with text/json/null outputs", () => {
			const msg = (llm as any).contentToAiSdkMessage({
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "c1",
							name: "search",
							response: "plain",
						},
					},
					{
						functionResponse: {
							id: "c2",
							name: "lookup",
							response: { ok: true },
						},
					},
					{
						functionResponse: {
							id: "c3",
							response: null,
						},
					},
				],
			});
			expect(msg).toEqual({
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "c1",
						toolName: "search",
						output: { type: "text", value: "plain" },
					},
					{
						type: "tool-result",
						toolCallId: "c2",
						toolName: "lookup",
						output: { type: "json", value: { ok: true } },
					},
					{
						type: "tool-result",
						toolCallId: "c3",
						toolName: "unknown",
						output: { type: "json", value: null },
					},
				],
			});
		});

		it("joins multi-text system parts and returns null for non-text parts", () => {
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "system",
					parts: [{ text: "a" }, { text: "b" }],
				}),
			).toEqual({ role: "system", content: "ab" });

			expect(
				(llm as any).contentToAiSdkMessage({
					role: "user",
					parts: [{ inlineData: { mimeType: "image/png", data: "x" } }],
				}),
			).toBeNull();
		});

		it("returns multi-text user and assistant as array content parts", () => {
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "user",
					parts: [{ text: "one" }, { text: "two" }],
				}),
			).toEqual({
				role: "user",
				content: [
					{ type: "text", text: "one" },
					{ type: "text", text: "two" },
				],
			});

			expect(
				(llm as any).contentToAiSdkMessage({
					role: "model",
					parts: [{ text: "a" }, { text: "b" }],
				}),
			).toEqual({
				role: "assistant",
				content: [
					{ type: "text", text: "a" },
					{ type: "text", text: "b" },
				],
			});
		});

		it("builds tool-call assistant message from function-call-only content", () => {
			const msg = (llm as any).contentToAiSdkMessage({
				role: "model",
				parts: [
					{
						functionCall: {
							id: "only-fc",
							name: "ping",
							args: {},
						},
					},
				],
			});
			expect(msg).toEqual({
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolCallId: "only-fc",
						toolName: "ping",
						input: {},
					},
				],
			});
		});

		it("maps undefined functionResponse to json null and missing name to unknown", () => {
			const msg = (llm as any).contentToAiSdkMessage({
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "c-undef",
							name: "tool",
							response: undefined,
						},
					},
					{
						functionResponse: {
							id: "c-noname",
							response: { ok: 1 },
						},
					},
				],
			});
			expect(msg).toEqual({
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "c-undef",
						toolName: "tool",
						output: { type: "json", value: null },
					},
					{
						type: "tool-result",
						toolCallId: "c-noname",
						toolName: "unknown",
						output: { type: "json", value: { ok: 1 } },
					},
				],
			});
		});
	});

	describe("convertToAiSdkMessages", () => {
		it("drops null messages from empty or non-text parts", () => {
			const messages = (llm as any).convertToAiSdkMessages(
				new LlmRequest({
					contents: [
						{ role: "user", parts: [] },
						{
							role: "user",
							parts: [{ inlineData: { mimeType: "image/png", data: "x" } }],
						},
						{ role: "user", parts: [{ text: "keep" }] },
					],
				}),
			);
			expect(messages).toEqual([{ role: "user", content: "keep" }]);
		});

		it("returns empty array when contents are missing", () => {
			expect((llm as any).convertToAiSdkMessages(new LlmRequest())).toEqual([]);
		});
	});

	describe("generateContentAsyncImpl", () => {
		it("yields a non-stream response with tools and usage", async () => {
			generateText.mockResolvedValue({
				text: "hello",
				toolCalls: [
					{
						toolCallId: "t1",
						toolName: "search",
						input: { q: "x" },
					},
				],
				usage: {
					inputTokens: 1,
					outputTokens: 2,
					totalTokens: 3,
				},
				finishReason: "stop",
			});

			const request = new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: {
					systemInstruction: "be brief",
					maxOutputTokens: 10,
					temperature: 0.2,
					topP: 0.9,
					tools: [
						{
							functionDeclarations: [
								{
									name: "search",
									description: "Search",
									parameters: { type: "OBJECT" },
								},
							],
						},
					],
				},
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				request,
				false,
			)) {
				responses.push(response);
			}

			expect(generateText).toHaveBeenCalledOnce();
			expect(responses).toHaveLength(1);
			expect(responses[0].content.parts).toEqual([
				{ text: "hello" },
				{
					functionCall: {
						id: "t1",
						name: "search",
						args: { q: "x" },
					},
				},
			]);
			expect(responses[0].finishReason).toBe("STOP");
			expect(responses[0].usageMetadata).toEqual({
				promptTokenCount: 1,
				candidatesTokenCount: 2,
				totalTokenCount: 3,
			});
		});

		it("streams partial text then a final turn with tool calls", async () => {
			streamText.mockReturnValue({
				textStream: (async function* () {
					yield "Hel";
					yield "lo";
				})(),
				toolCalls: Promise.resolve([
					{
						toolCallId: "t1",
						toolName: "search",
						input: { q: "adk" },
					},
				]),
				usage: Promise.resolve({
					inputTokens: 4,
					outputTokens: 5,
					totalTokens: 9,
				}),
				finishReason: Promise.resolve("length"),
			});

			const request = new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				request,
				true,
			)) {
				responses.push(response);
			}

			expect(responses).toHaveLength(3);
			expect(responses[0].partial).toBe(true);
			expect(responses[0].content.parts[0].text).toBe("Hel");
			expect(responses[1].content.parts[0].text).toBe("Hello");
			expect(responses[2].partial).toBeUndefined();
			expect(responses[2].turnComplete).toBe(true);
			expect(responses[2].finishReason).toBe("MAX_TOKENS");
			expect(responses[2].content.parts).toEqual([
				{ text: "Hello" },
				{
					functionCall: {
						id: "t1",
						name: "search",
						args: { q: "adk" },
					},
				},
			]);
		});

		it("yields an error response when generateText throws", async () => {
			generateText.mockRejectedValue(new Error("provider down"));

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest(),
				false,
			)) {
				responses.push(response);
			}

			expect(responses).toHaveLength(1);
			expect(responses[0].errorCode).toBe("AI_SDK_ERROR");
			expect(responses[0].errorMessage).toContain("provider down");
		});

		it("yields empty text part when non-stream result has no text or toolCalls", async () => {
			generateText.mockResolvedValue({
				text: "",
				toolCalls: [],
				usage: {
					inputTokens: 1,
					outputTokens: 0,
					totalTokens: 1,
				},
				finishReason: "stop",
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "hi" }] }],
				}),
				false,
			)) {
				responses.push(response);
			}

			expect(responses[0].content.parts).toEqual([{ text: "" }]);
			expect(responses[0].turnComplete).toBe(true);
		});

		it("yields toolCalls only when non-stream text is empty", async () => {
			generateText.mockResolvedValue({
				text: "",
				toolCalls: [
					{
						toolCallId: "only",
						toolName: "ping",
						input: { n: 1 },
					},
				],
				usage: undefined,
				finishReason: "stop",
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "hi" }] }],
				}),
				false,
			)) {
				responses.push(response);
			}

			expect(responses[0].content.parts).toEqual([
				{
					functionCall: {
						id: "only",
						name: "ping",
						args: { n: 1 },
					},
				},
			]);
			expect(responses[0].usageMetadata).toBeUndefined();
		});

		it("passes maxTokens temperature topP system and omits tools without declarations", async () => {
			generateText.mockResolvedValue({
				text: "ok",
				toolCalls: [],
				usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				finishReason: "stop",
			});

			const request = new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: {
					systemInstruction: "system prompt",
					maxOutputTokens: 99,
					temperature: 0.4,
					topP: 0.7,
					tools: [{ googleSearchRetrieval: {} } as any],
				},
			});

			for await (const _ of (llm as any).generateContentAsyncImpl(
				request,
				false,
			)) {
				// drain
			}

			expect(generateText).toHaveBeenCalledWith(
				expect.objectContaining({
					system: "system prompt",
					maxTokens: 99,
					temperature: 0.4,
					topP: 0.7,
					tools: undefined,
				}),
			);
		});

		it("yields AI_SDK_ERROR when streamText provider throws", async () => {
			streamText.mockImplementation(() => {
				throw new Error("stream failed");
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "hi" }] }],
				}),
				true,
			)) {
				responses.push(response);
			}

			expect(responses).toHaveLength(1);
			expect(responses[0].errorCode).toBe("AI_SDK_ERROR");
			expect(responses[0].errorMessage).toContain("stream failed");
		});

		it("streams toolCalls only when text stream is empty", async () => {
			streamText.mockReturnValue({
				textStream: (async function* () {})(),
				toolCalls: Promise.resolve([
					{
						toolCallId: "t-empty",
						toolName: "lookup",
						input: { q: "z" },
					},
				]),
				usage: Promise.resolve({
					inputTokens: 2,
					outputTokens: 3,
					totalTokens: 5,
				}),
				finishReason: Promise.resolve("stop"),
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "hi" }] }],
				}),
				true,
			)) {
				responses.push(response);
			}

			expect(responses).toHaveLength(1);
			expect(responses[0].partial).toBeUndefined();
			expect(responses[0].turnComplete).toBe(true);
			expect(responses[0].content.parts).toEqual([
				{
					functionCall: {
						id: "t-empty",
						name: "lookup",
						args: { q: "z" },
					},
				},
			]);
			expect(responses[0].usageMetadata).toEqual({
				promptTokenCount: 2,
				candidatesTokenCount: 3,
				totalTokenCount: 5,
			});
		});

		it("omits usageMetadata when streamed usage is undefined", async () => {
			streamText.mockReturnValue({
				textStream: (async function* () {
					yield "x";
				})(),
				toolCalls: Promise.resolve([]),
				usage: Promise.resolve(undefined),
				finishReason: Promise.resolve("stop"),
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "hi" }] }],
				}),
				true,
			)) {
				responses.push(response);
			}

			const final = responses[responses.length - 1];
			expect(final.turnComplete).toBe(true);
			expect(final.usageMetadata).toBeUndefined();
			expect(final.content.parts).toEqual([{ text: "x" }]);
		});

		it("falls back to empty text part when stream has no text and no toolCalls", async () => {
			streamText.mockReturnValue({
				textStream: (async function* () {})(),
				toolCalls: Promise.resolve([]),
				usage: Promise.resolve(undefined),
				finishReason: Promise.resolve("other"),
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "hi" }] }],
				}),
				true,
			)) {
				responses.push(response);
			}

			expect(responses).toHaveLength(1);
			expect(responses[0].content.parts).toEqual([{ text: "" }]);
			expect(responses[0].finishReason).toBe("FINISH_REASON_UNSPECIFIED");
			expect(responses[0].usageMetadata).toBeUndefined();
		});

		it("treats null streamed toolCalls like an empty list", async () => {
			streamText.mockReturnValue({
				textStream: (async function* () {
					yield "solo";
				})(),
				toolCalls: Promise.resolve(null),
				usage: Promise.resolve({
					inputTokens: 1,
					outputTokens: 1,
					totalTokens: 2,
				}),
				finishReason: Promise.resolve("end_of_message"),
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "hi" }] }],
				}),
				true,
			)) {
				responses.push(response);
			}

			const final = responses[responses.length - 1];
			expect(final.content.parts).toEqual([{ text: "solo" }]);
			expect(final.finishReason).toBe("STOP");
		});

		it("forwards function-call history into generateText messages", async () => {
			generateText.mockResolvedValue({
				text: "acked",
				toolCalls: [],
				finishReason: "stop",
			});

			const request = new LlmRequest({
				contents: [
					{ role: "user", parts: [{ text: "use tool" }] },
					{
						role: "model",
						parts: [
							{
								functionCall: {
									id: "h1",
									name: "search",
									args: { q: 1 },
								},
							},
						],
					},
					{
						role: "user",
						parts: [
							{
								functionResponse: {
									id: "h1",
									name: "search",
									response: { hits: [] },
								},
							},
						],
					},
				],
			});

			for await (const _ of (llm as any).generateContentAsyncImpl(
				request,
				false,
			)) {
				// drain
			}

			expect(generateText).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: [
						{ role: "user", content: "use tool" },
						{
							role: "assistant",
							content: [
								{
									type: "tool-call",
									toolCallId: "h1",
									toolName: "search",
									input: { q: 1 },
								},
							],
						},
						{
							role: "tool",
							content: [
								{
									type: "tool-result",
									toolCallId: "h1",
									toolName: "search",
									output: { type: "json", value: { hits: [] } },
								},
							],
						},
					],
				}),
			);
		});

		it("omits usageMetadata when non-stream usage is missing", async () => {
			generateText.mockResolvedValue({
				text: "no usage",
				finishReason: "stop",
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "hi" }] }],
				}),
				false,
			)) {
				responses.push(response);
			}

			expect(responses[0].content.parts).toEqual([{ text: "no usage" }]);
			expect(responses[0].usageMetadata).toBeUndefined();
			expect(responses[0].finishReason).toBe("STOP");
		});
	});
});
