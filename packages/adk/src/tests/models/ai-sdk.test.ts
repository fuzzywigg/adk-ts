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

		it("yields AI_SDK_ERROR when streamText throws synchronously", async () => {
			streamText.mockImplementation(() => {
				throw new Error("stream boom");
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "x" }] }],
				}),
				true,
			)) {
				responses.push(response);
			}

			expect(responses).toHaveLength(1);
			expect(responses[0].errorCode).toBe("AI_SDK_ERROR");
			expect(responses[0].errorMessage).toContain("stream boom");
		});

		it("non-stream yields empty text part when provider returns no text or tools", async () => {
			generateText.mockResolvedValue({
				text: "",
				toolCalls: [],
				finishReason: "end_of_message",
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
			expect(responses[0].finishReason).toBe("STOP");
			expect(responses[0].usageMetadata).toBeUndefined();
			expect(responses[0].turnComplete).toBe(true);
		});

		it("non-stream maps tool-only responses and omits unused tools config entries", async () => {
			generateText.mockResolvedValue({
				text: undefined,
				toolCalls: [{ toolCallId: "t9", toolName: "ping", input: { n: 1 } }],
				usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
				finishReason: "max_tokens",
			});

			const request = new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: {
					tools: [
						{ googleSearch: {} } as any,
						{
							functionDeclarations: [
								{ name: "ping", description: "p", parameters: undefined },
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

			expect(jsonSchema).toHaveBeenCalledWith({});
			expect(generateText).toHaveBeenCalledWith(
				expect.objectContaining({
					tools: expect.objectContaining({
						ping: expect.objectContaining({ description: "p" }),
					}),
				}),
			);
			expect(responses[0].content.parts).toEqual([
				{ functionCall: { id: "t9", name: "ping", args: { n: 1 } } },
			]);
			expect(responses[0].finishReason).toBe("MAX_TOKENS");
			expect(responses[0].usageMetadata).toEqual({
				promptTokenCount: 2,
				candidatesTokenCount: 3,
				totalTokenCount: 5,
			});
		});

		it("streams empty text to a blank final part without usage or tools", async () => {
			streamText.mockReturnValue({
				textStream: (async function* () {})(),
				toolCalls: Promise.resolve([]),
				usage: Promise.resolve(undefined),
				finishReason: Promise.resolve("other"),
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({ contents: undefined as any }),
				true,
			)) {
				responses.push(response);
			}

			expect(responses).toHaveLength(1);
			expect(responses[0].content.parts).toEqual([{ text: "" }]);
			expect(responses[0].usageMetadata).toBeUndefined();
			expect(responses[0].finishReason).toBe("FINISH_REASON_UNSPECIFIED");
			expect(responses[0].turnComplete).toBe(true);
		});

		it("streams text-only finals without toolCalls and maps stop finish", async () => {
			streamText.mockReturnValue({
				textStream: (async function* () {
					yield "a";
				})(),
				toolCalls: Promise.resolve(undefined),
				usage: Promise.resolve({
					inputTokens: 1,
					outputTokens: 1,
					totalTokens: 2,
				}),
				finishReason: Promise.resolve("stop"),
			});

			const responses = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "q" }] }],
				}),
				true,
			)) {
				responses.push(response);
			}

			expect(responses).toHaveLength(2);
			expect(responses[0].partial).toBe(true);
			expect(responses[1].content.parts).toEqual([{ text: "a" }]);
			expect(responses[1].finishReason).toBe("STOP");
			expect(responses[1].usageMetadata?.totalTokenCount).toBe(2);
		});

		it("forwards system instruction and omits tools when convert yields empty", async () => {
			generateText.mockResolvedValue({
				text: "ok",
				toolCalls: [],
				finishReason: "stop",
				usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			});

			const request = new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: {
					systemInstruction: "sys",
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
					system: "sys",
					tools: undefined,
					maxTokens: undefined,
					temperature: undefined,
					topP: undefined,
				}),
			);
		});
	});

	describe("contentToAiSdkMessage leftovers", () => {
		it("converts function calls that include accompanying text parts", () => {
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "model",
					parts: [
						{ text: "calling" },
						{ functionCall: { id: "c1", name: "search", args: { q: 1 } } },
						{ functionCall: undefined },
						{ text: "" },
					],
				}),
			).toEqual({
				role: "assistant",
				content: [
					{ type: "text", text: "calling" },
					{
						type: "tool-call",
						toolCallId: "c1",
						toolName: "search",
						input: { q: 1 },
					},
				],
			});
		});

		it("maps multi-text user and assistant messages", () => {
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "user",
					parts: [{ text: "a" }, { text: "b" }],
				}),
			).toEqual({
				role: "user",
				content: [
					{ type: "text", text: "a" },
					{ type: "text", text: "b" },
				],
			});

			expect(
				(llm as any).contentToAiSdkMessage({
					role: "assistant",
					parts: [{ text: "x" }, { text: "y" }],
				}),
			).toEqual({
				role: "assistant",
				content: [
					{ type: "text", text: "x" },
					{ type: "text", text: "y" },
				],
			});
		});

		it("collapses multi-part content that filters down to a single text part", () => {
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "assistant",
					parts: [{ inlineData: { data: "x" } }, { text: "only" }],
				}),
			).toEqual({ role: "assistant", content: "only" });

			expect(
				(llm as any).contentToAiSdkMessage({
					role: "system",
					parts: [{ inlineData: { data: "x" } }, { text: "sys" }],
				}),
			).toEqual({ role: "system", content: "sys" });

			expect(
				(llm as any).contentToAiSdkMessage({
					role: "user",
					parts: [{ inlineData: { data: "x" } }, { text: "u" }],
				}),
			).toEqual({ role: "user", content: "u" });
		});

		it("defaults tool result name to unknown when functionResponse omits it", () => {
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "r1",
								response: { ok: true },
							},
						},
					],
				}),
			).toEqual({
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "r1",
						toolName: "unknown",
						output: { type: "json", value: { ok: true } },
					},
				],
			});
		});
	});

	describe("convert and schema leftovers", () => {
		it("convertToAiSdkMessages skips null conversions from empty parts", () => {
			expect(
				(llm as any).convertToAiSdkMessages(
					new LlmRequest({
						contents: [
							{ role: "user", parts: [] },
							{ role: "user", parts: [{ text: "keep" }] },
						],
					}),
				),
			).toEqual([{ role: "user", content: "keep" }]);

			expect((llm as any).convertToAiSdkMessages(new LlmRequest({}))).toEqual(
				[],
			);
		});

		it("convertToAiSdkMessages treats falsy contents as an empty list", () => {
			expect(
				(llm as any).convertToAiSdkMessages({ contents: null } as any),
			).toEqual([]);
			expect((llm as any).convertToAiSdkMessages({} as any)).toEqual([]);
			expect(
				(llm as any).convertToAiSdkMessages({
					contents: undefined,
				} as any),
			).toEqual([]);
		});

		it("convertToAiSdkTools returns {} when tools array is empty", () => {
			expect(
				(llm as any).convertToAiSdkTools(
					new LlmRequest({ config: { tools: [] } }),
				),
			).toEqual({});
		});

		it("transformSchemaForAiSdk lowercases oneOf/allOf and leaves non-string types", () => {
			const transformed = (llm as any).transformSchemaForAiSdk({
				type: ["STRING", "NULL"],
				oneOf: [{ type: "NUMBER" }],
				allOf: [{ type: "BOOLEAN" }],
			});
			expect(transformed.type).toEqual(["STRING", "NULL"]);
			expect(transformed.oneOf[0].type).toBe("number");
			expect(transformed.allOf[0].type).toBe("boolean");
		});

		it("mapFinishReason covers every documented branch", () => {
			expect((llm as any).mapFinishReason("stop")).toBe("STOP");
			expect((llm as any).mapFinishReason("end_of_message")).toBe("STOP");
			expect((llm as any).mapFinishReason("length")).toBe("MAX_TOKENS");
			expect((llm as any).mapFinishReason("max_tokens")).toBe("MAX_TOKENS");
			expect((llm as any).mapFinishReason(undefined)).toBe(
				"FINISH_REASON_UNSPECIFIED",
			);
			expect((llm as any).mapFinishReason("tool-calls")).toBe(
				"FINISH_REASON_UNSPECIFIED",
			);
		});

		it("mapRole treats model and assistant as assistant", () => {
			expect((llm as any).mapRole("model")).toBe("assistant");
			expect((llm as any).mapRole("assistant")).toBe("assistant");
			expect((llm as any).mapRole("system")).toBe("system");
			expect((llm as any).mapRole("tool")).toBe("user");
			expect((llm as any).mapRole(undefined)).toBe("user");
		});
	});
});
