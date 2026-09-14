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

function makeModel(modelId = "matrix-model"): LanguageModel {
	return {
		modelId,
		provider: "mock",
		specificationVersion: "v2",
	} as unknown as LanguageModel;
}

describe("AiSdkLlm heavy matrix leftover edges (post #144)", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new AiSdkLlm(makeModel());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	async function collect(
		gen: AsyncGenerator<LlmResponse, void, unknown>,
	): Promise<LlmResponse[]> {
		const out: LlmResponse[] = [];
		for await (const item of gen) {
			out.push(item);
		}
		return out;
	}

	describe("transformSchemaForAiSdk matrix", () => {
		it.each([
			{
				label: "nested properties + items + anyOf",
				input: {
					type: "OBJECT",
					properties: {
						a: { type: "STRING" },
						b: {
							type: "ARRAY",
							items: { type: "NUMBER" },
						},
					},
					anyOf: [{ type: "BOOLEAN" }, { type: "NULL" }],
				},
				assert: (out: any) => {
					expect(out.type).toBe("object");
					expect(out.properties.a.type).toBe("string");
					expect(out.properties.b.type).toBe("array");
					expect(out.properties.b.items.type).toBe("number");
					expect(out.anyOf[0].type).toBe("boolean");
					expect(out.anyOf[1].type).toBe("null");
				},
			},
			{
				label: "oneOf and allOf arrays of schemas",
				input: {
					oneOf: [{ type: "INTEGER" }, { type: "STRING" }],
					allOf: [{ type: "OBJECT", properties: { x: { type: "BOOLEAN" } } }],
				},
				assert: (out: any) => {
					expect(out.oneOf[0].type).toBe("integer");
					expect(out.oneOf[1].type).toBe("string");
					expect(out.allOf[0].type).toBe("object");
					expect(out.allOf[0].properties.x.type).toBe("boolean");
				},
			},
			{
				label: "array schema root",
				input: [{ type: "STRING" }, { type: "NUMBER" }],
				assert: (out: any) => {
					expect(out).toEqual([{ type: "string" }, { type: "number" }]);
				},
			},
			{
				label: "non-object passthrough",
				input: "raw",
				assert: (out: any) => {
					expect(out).toBe("raw");
				},
			},
			{
				label: "null passthrough",
				input: null,
				assert: (out: any) => {
					expect(out).toBeNull();
				},
			},
			{
				label: "non-string type left alone",
				input: { type: ["STRING", "NULL"] },
				assert: (out: any) => {
					expect(out.type).toEqual(["STRING", "NULL"]);
				},
			},
			{
				label: "items as array of schemas",
				input: {
					type: "ARRAY",
					items: [{ type: "STRING" }, { type: "NUMBER" }],
				},
				assert: (out: any) => {
					expect(out.items).toEqual([{ type: "string" }, { type: "number" }]);
				},
			},
		])("$label", ({ input, assert }) => {
			assert((llm as any).transformSchemaForAiSdk(input));
		});
	});

	describe("convertToAiSdkTools matrix", () => {
		it.each([
			{
				label: "undefined config",
				request: new LlmRequest({}),
				expectedKeys: [],
			},
			{
				label: "empty tools",
				request: new LlmRequest({ config: { tools: [] } }),
				expectedKeys: [],
			},
			{
				label: "tools without functionDeclarations skipped",
				request: new LlmRequest({
					config: { tools: [{ googleSearch: {} } as any] },
				}),
				expectedKeys: [],
			},
			{
				label: "mixed tools keep only declarations",
				request: new LlmRequest({
					config: {
						tools: [
							{ googleSearch: {} } as any,
							{
								functionDeclarations: [
									{
										name: "alpha",
										description: "A",
										parameters: { type: "OBJECT" },
									},
									{ name: "beta" },
								],
							},
						],
					},
				}),
				expectedKeys: ["alpha", "beta"],
			},
		])("$label", ({ request, expectedKeys }) => {
			const tools = (llm as any).convertToAiSdkTools(request);
			expect(Object.keys(tools)).toEqual(expectedKeys);
			if (expectedKeys.includes("beta")) {
				expect(jsonSchema).toHaveBeenCalledWith({});
			}
		});

		it("defaults missing parameters to {} and lowercases schema types", () => {
			const tools = (llm as any).convertToAiSdkTools(
				new LlmRequest({
					config: {
						tools: [
							{
								functionDeclarations: [
									{
										name: "search",
										description: "find",
										parameters: {
											type: "OBJECT",
											properties: { q: { type: "STRING" } },
										},
									},
								],
							},
						],
					},
				}),
			);
			expect(tools.search.description).toBe("find");
			expect(jsonSchema).toHaveBeenCalledWith({
				type: "object",
				properties: { q: { type: "string" } },
			});
		});
	});

	describe("generateContentAsyncImpl stream/non-stream matrix", () => {
		it.each([
			{
				label: "text + tools + usage",
				result: {
					text: "hello",
					toolCalls: [{ toolCallId: "t1", toolName: "alpha", input: { q: 1 } }],
					usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
					finishReason: "stop",
				},
				assert: (responses: LlmResponse[]) => {
					expect(responses).toHaveLength(1);
					expect(responses[0].content?.parts).toEqual([
						{ text: "hello" },
						{
							functionCall: { id: "t1", name: "alpha", args: { q: 1 } },
						},
					]);
					expect(responses[0].usageMetadata).toEqual({
						promptTokenCount: 2,
						candidatesTokenCount: 3,
						totalTokenCount: 5,
					});
					expect(responses[0].finishReason).toBe("STOP");
					expect(responses[0].turnComplete).toBe(true);
				},
			},
			{
				label: "tool-only empty text",
				result: {
					text: "",
					toolCalls: [{ toolCallId: "t2", toolName: "beta", input: {} }],
					usage: undefined,
					finishReason: "tool-calls",
				},
				assert: (responses: LlmResponse[]) => {
					expect(responses[0].content?.parts).toEqual([
						{
							functionCall: { id: "t2", name: "beta", args: {} },
						},
					]);
					expect(responses[0].usageMetadata).toBeUndefined();
					expect(responses[0].finishReason).toBe("FINISH_REASON_UNSPECIFIED");
				},
			},
			{
				label: "empty text and empty tools => blank part",
				result: {
					text: "",
					toolCalls: [],
					usage: undefined,
					finishReason: "length",
				},
				assert: (responses: LlmResponse[]) => {
					expect(responses[0].content?.parts).toEqual([{ text: "" }]);
					expect(responses[0].finishReason).toBe("MAX_TOKENS");
				},
			},
		])("non-stream $label", async ({ result, assert }) => {
			generateText.mockResolvedValue(result);
			const responses = await collect(
				(llm as any).generateContentAsyncImpl(
					new LlmRequest({
						contents: [{ role: "user", parts: [{ text: "hi" }] }],
					}),
					false,
				),
			);
			assert(responses);
		});

		it.each([
			{
				label: "partial deltas then tool final",
				deltas: ["a", "b"],
				toolCalls: [{ toolCallId: "c1", toolName: "lookup", input: { id: 9 } }],
				usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
				finishReason: "end_of_message",
				assert: (responses: LlmResponse[]) => {
					expect(responses[0]).toMatchObject({
						partial: true,
						content: { parts: [{ text: "a" }] },
					});
					expect(responses[1]).toMatchObject({
						partial: true,
						content: { parts: [{ text: "ab" }] },
					});
					const final = responses[responses.length - 1];
					expect(final.partial).toBeUndefined();
					expect(final.turnComplete).toBe(true);
					expect(final.finishReason).toBe("STOP");
					expect(final.content?.parts).toEqual([
						{ text: "ab" },
						{
							functionCall: { id: "c1", name: "lookup", args: { id: 9 } },
						},
					]);
				},
			},
			{
				label: "empty stream becomes blank final part",
				deltas: [],
				toolCalls: undefined,
				usage: undefined,
				finishReason: "max_tokens",
				assert: (responses: LlmResponse[]) => {
					expect(responses).toHaveLength(1);
					expect(responses[0].content?.parts).toEqual([{ text: "" }]);
					expect(responses[0].finishReason).toBe("MAX_TOKENS");
					expect(responses[0].usageMetadata).toBeUndefined();
				},
			},
			{
				label: "text-only stream without toolCalls",
				deltas: ["z"],
				toolCalls: [],
				usage: { inputTokens: 0, outputTokens: 1, totalTokens: 1 },
				finishReason: "stop",
				assert: (responses: LlmResponse[]) => {
					expect(responses).toHaveLength(2);
					expect(responses[1].content?.parts).toEqual([{ text: "z" }]);
				},
			},
		])("stream $label", async ({
			deltas,
			toolCalls,
			usage,
			finishReason,
			assert,
		}) => {
			streamText.mockReturnValue({
				textStream: (async function* () {
					for (const d of deltas) {
						yield d;
					}
				})(),
				toolCalls: Promise.resolve(toolCalls),
				usage: Promise.resolve(usage),
				finishReason: Promise.resolve(finishReason),
			});

			const responses = await collect(
				(llm as any).generateContentAsyncImpl(
					new LlmRequest({
						contents: [{ role: "user", parts: [{ text: "hi" }] }],
						config: {
							tools: [
								{
									functionDeclarations: [{ name: "lookup", description: "d" }],
								},
							],
						},
					}),
					true,
				),
			);
			assert(responses);
		});

		it("yields AI_SDK_ERROR when generateText rejects", async () => {
			generateText.mockRejectedValue(new Error("boom"));
			const responses = await collect(
				(llm as any).generateContentAsyncImpl(
					new LlmRequest({
						contents: [{ role: "user", parts: [{ text: "hi" }] }],
					}),
					false,
				),
			);
			expect(responses).toHaveLength(1);
			expect(responses[0].errorCode).toBe("AI_SDK_ERROR");
			expect(responses[0].errorMessage).toMatch(/boom/);
		});

		it("yields AI_SDK_ERROR when streamText throws synchronously", async () => {
			streamText.mockImplementation(() => {
				throw new Error("stream-boom");
			});
			const responses = await collect(
				(llm as any).generateContentAsyncImpl(
					new LlmRequest({
						contents: [{ role: "user", parts: [{ text: "hi" }] }],
					}),
					true,
				),
			);
			expect(responses[0].errorCode).toBe("AI_SDK_ERROR");
			expect(responses[0].errorMessage).toMatch(/stream-boom/);
		});

		it("forwards config knobs and omits empty tools", async () => {
			generateText.mockResolvedValue({
				text: "ok",
				toolCalls: [],
				finishReason: "stop",
			});
			await collect(
				(llm as any).generateContentAsyncImpl(
					new LlmRequest({
						contents: [{ role: "user", parts: [{ text: "hi" }] }],
						config: {
							maxOutputTokens: 11,
							temperature: 0.3,
							topP: 0.8,
							tools: [{ googleSearch: {} } as any],
						},
					}),
					false,
				),
			);
			expect(generateText).toHaveBeenCalledWith(
				expect.objectContaining({
					maxTokens: 11,
					temperature: 0.3,
					topP: 0.8,
					tools: undefined,
				}),
			);
		});
	});

	describe("mapFinishReason / mapRole matrix", () => {
		it.each([
			["stop", "STOP"],
			["end_of_message", "STOP"],
			["length", "MAX_TOKENS"],
			["max_tokens", "MAX_TOKENS"],
			["tool-calls", "FINISH_REASON_UNSPECIFIED"],
			["", "FINISH_REASON_UNSPECIFIED"],
			[undefined, "FINISH_REASON_UNSPECIFIED"],
		])("mapFinishReason(%s) => %s", (input, expected) => {
			expect((llm as any).mapFinishReason(input)).toBe(expected);
		});

		it.each([
			["model", "assistant"],
			["assistant", "assistant"],
			["system", "system"],
			["user", "user"],
			["tool", "user"],
			[undefined, "user"],
			["", "user"],
		])("mapRole(%s) => %s", (input, expected) => {
			expect((llm as any).mapRole(input)).toBe(expected);
		});
	});
});
