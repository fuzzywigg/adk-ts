import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { AiSdkLlm } from "../../models/ai-sdk";
import { AnthropicLlm } from "../../models/anthropic-llm";
import { GoogleLlm } from "../../models/google-llm";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
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

vi.mock("@anthropic-ai/sdk");

vi.mock("@google/genai", () => ({
	GoogleGenAI: vi.fn(),
	FinishReason: {
		STOP: "STOP",
		MAX_TOKENS: "MAX_TOKENS",
		FINISH_REASON_UNSPECIFIED: "FINISH_REASON_UNSPECIFIED",
	},
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

describe("models coalesce leftover edges", () => {
	describe("OpenAiLlm contents || [] and stream thought leftovers", () => {
		let llm: OpenAiLlm;
		let originalEnv: NodeJS.ProcessEnv;
		let mockCreate: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			originalEnv = { ...process.env };
			process.env.OPENAI_API_KEY = "test-key";
			mockCreate = vi.fn();
			(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
				() => ({
					chat: {
						completions: {
							create: mockCreate,
						},
					},
				}),
			);
			llm = new OpenAiLlm();
		});

		afterEach(() => {
			process.env = originalEnv;
			vi.clearAllMocks();
		});

		const missingContentsCases: Array<{
			label: string;
			contents: unknown;
		}> = [
			{ label: "undefined", contents: undefined },
			{ label: "null", contents: null },
			{ label: "omitted", contents: "OMIT" },
		];

		for (const { label, contents } of missingContentsCases) {
			it(`non-stream coalesce uses [] when contents is ${label}`, async () => {
				mockCreate.mockResolvedValue({
					choices: [
						{
							message: { content: "ok", tool_calls: [] },
							finish_reason: "stop",
						},
					],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});

				const request =
					contents === "OMIT"
						? new LlmRequest({})
						: new LlmRequest({ contents: contents as any });
				if (contents === "OMIT") {
					delete (request as any).contents;
				}

				const responses: LlmResponse[] = [];
				for await (const response of (llm as any).generateContentAsyncImpl(
					request,
					false,
				)) {
					responses.push(response);
				}

				expect(mockCreate).toHaveBeenCalledWith(
					expect.objectContaining({ messages: [], stream: false }),
				);
				expect(responses).toHaveLength(1);
				expect(responses[0].content?.parts?.[0]).toEqual({ text: "ok" });
			});
		}

		it("streams finish with only thoughtText then leftover thought+usage yield", async () => {
			mockCreate.mockResolvedValue(
				(async function* () {
					yield {
						choices: [
							{
								delta: { content: "[thinking] solo-thought" },
								finish_reason: "stop",
							},
						],
						usage: {
							prompt_tokens: 4,
							completion_tokens: 5,
							total_tokens: 9,
						},
					};
				})(),
			);

			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "q" }] }],
				}),
				true,
			)) {
				responses.push(response);
			}

			const finished = responses.find((r) => r.finishReason === "STOP");
			expect(finished?.content?.parts).toEqual([
				{ text: "[thinking] solo-thought", thought: true },
			]);
			expect(finished?.usageMetadata?.totalTokenCount).toBe(9);

			const leftover = responses.filter(
				(r) =>
					!r.finishReason &&
					!r.partial &&
					r.content?.parts?.some((p: any) => p.thought) &&
					r.usageMetadata?.totalTokenCount === 9,
			);
			expect(leftover.length).toBeGreaterThanOrEqual(1);
			expect(leftover[0].content?.parts).toEqual([
				{ text: "[thinking] solo-thought", thought: true },
			]);
		});

		it("streams thought-only partials then finish on same thought chunk family", async () => {
			mockCreate.mockResolvedValue(
				(async function* () {
					yield {
						choices: [
							{
								delta: { content: "[thinking] part-a" },
								finish_reason: null,
							},
						],
					};
					yield {
						choices: [
							{
								delta: { content: "[thinking] part-b" },
								finish_reason: "stop",
							},
						],
						usage: {
							prompt_tokens: 2,
							completion_tokens: 3,
							total_tokens: 5,
						},
					};
				})(),
			);

			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "q" }] }],
				}),
				true,
			)) {
				responses.push(response);
			}

			expect(
				responses.some(
					(r) =>
						r.partial === true &&
						(r.content?.parts?.[0] as any)?.thought === true,
				),
			).toBe(true);

			const finished = responses.find((r) => r.finishReason === "STOP");
			expect(
				finished?.content?.parts?.every((p: any) => p.thought === true),
			).toBe(true);
			expect(finished?.content?.parts?.some((p: any) => !p.thought)).toBe(
				false,
			);
			expect(
				finished?.content?.parts?.map((p: any) => p.text).join(""),
			).toContain("part");
		});

		const omittedArgCases = [
			{ label: "empty string", arguments: "" },
			{ label: "undefined", arguments: undefined },
			{ label: "null", arguments: null },
		];

		for (const { label, arguments: args } of omittedArgCases) {
			it(`stream tool-call arguments ${label} coalesce to {}`, async () => {
				mockCreate.mockResolvedValue(
					(async function* () {
						yield {
							choices: [
								{
									delta: {
										tool_calls: [
											{
												index: 0,
												id: "call-1",
												type: "function",
												function: { name: "lookup", arguments: args as any },
											},
										],
									},
									finish_reason: null,
								},
							],
						};
						yield {
							choices: [
								{
									delta: {},
									finish_reason: "tool_calls",
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

				const responses: LlmResponse[] = [];
				for await (const response of (llm as any).generateContentAsyncImpl(
					new LlmRequest({
						contents: [{ role: "user", parts: [{ text: "q" }] }],
					}),
					true,
				)) {
					responses.push(response);
				}

				const finished = responses.find(
					(r) => r.finishReason === "STOP" || r.finishReason === "stop",
				);
				const toolPart = finished?.content?.parts?.find(
					(p: any) => p.functionCall?.name === "lookup",
				);
				expect(toolPart?.functionCall?.args).toEqual({});
			});
		}

		it("createChunkResponse parses omitted tool-call arguments as {}", () => {
			const response = (llm as any).createChunkResponse({
				tool_calls: [
					{
						index: 0,
						id: "c1",
						type: "function",
						function: { name: "fn", arguments: undefined },
					},
				],
			});
			expect(response.content?.parts?.[0]?.functionCall?.args).toEqual({});
		});
	});

	describe("AnthropicLlm contents || [] and parts || []", () => {
		let anthropicLlm: AnthropicLlm;
		let mockMessagesCreate: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			vi.clearAllMocks();
			process.env.ANTHROPIC_API_KEY = "test-api-key";
			anthropicLlm = new AnthropicLlm();
			mockMessagesCreate = vi.fn().mockResolvedValue({
				content: [{ type: "text", text: "hi" }],
				usage: { input_tokens: 1, output_tokens: 1 },
				stop_reason: "end_turn",
			});
			(Anthropic as any).mockImplementation(() => ({
				messages: { create: mockMessagesCreate },
			}));
		});

		const missingContentsCases: Array<{
			label: string;
			build: () => LlmRequest;
		}> = [
			{
				label: "undefined",
				build: () =>
					({
						contents: undefined,
						config: {},
						getSystemInstructionText: () => "",
					}) as unknown as LlmRequest,
			},
			{
				label: "null",
				build: () =>
					({
						contents: null,
						config: {},
						getSystemInstructionText: () => "",
					}) as unknown as LlmRequest,
			},
			{
				label: "omitted",
				build: () =>
					({
						config: {},
						getSystemInstructionText: () => "",
					}) as unknown as LlmRequest,
			},
		];

		for (const { label, build } of missingContentsCases) {
			it(`coalesces missing contents (${label}) to []`, async () => {
				const generator = (anthropicLlm as any).generateContentAsyncImpl(
					build(),
				);
				const result = await generator.next();
				expect(result.value).toBeInstanceOf(LlmResponse);
				expect(mockMessagesCreate).toHaveBeenCalledWith(
					expect.objectContaining({ messages: [] }),
				);
			});
		}

		const missingPartsCases = [
			{ label: "undefined parts", parts: undefined },
			{ label: "null parts", parts: null },
			{ label: "omitted parts", parts: "OMIT" },
		];

		for (const { label, parts } of missingPartsCases) {
			it(`contentToAnthropicMessage coalesces ${label} to []`, () => {
				const content: any = { role: "user" };
				if (parts !== "OMIT") {
					content.parts = parts;
				}
				const message = (anthropicLlm as any).contentToAnthropicMessage(
					content,
				);
				expect(message.content).toEqual([]);
				expect(message.role).toBe("user");
			});
		}
	});

	describe("GoogleLlm contents || [] and convertContents parts default", () => {
		let originalEnv: NodeJS.ProcessEnv;

		beforeEach(() => {
			originalEnv = { ...process.env };
			vi.clearAllMocks();
			process.env.GOOGLE_API_KEY = "abc";
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
		});

		afterEach(() => {
			process.env = originalEnv;
		});

		const missingContentsCases: Array<{
			label: string;
			contents: unknown;
		}> = [
			{ label: "undefined", contents: undefined },
			{ label: "null", contents: null },
			{ label: "omitted", contents: "OMIT" },
		];

		for (const { label, contents } of missingContentsCases) {
			it(`generateContentAsyncImpl coalesces contents ${label} to []`, async () => {
				const generateContent = vi.fn().mockResolvedValue({
					candidates: [
						{
							content: { role: "model", parts: [{ text: "ok" }] },
							finishReason: "STOP",
						},
					],
					usageMetadata: {
						promptTokenCount: 1,
						candidatesTokenCount: 1,
						totalTokenCount: 2,
					},
				});
				(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
					() => ({
						models: {
							generateContent,
							generateContentStream: vi.fn(),
						},
					}),
				);

				const llm = new GoogleLlm();
				const request =
					contents === "OMIT"
						? new LlmRequest({})
						: new LlmRequest({ contents: contents as any });
				if (contents === "OMIT") {
					delete (request as any).contents;
				}

				for await (const _ of (llm as any).generateContentAsyncImpl(
					request,
					false,
				)) {
					/* drain */
				}

				expect(generateContent).toHaveBeenCalledWith(
					expect.objectContaining({ contents: [] }),
				);
			});
		}

		const convertPartsCases = [
			{
				label: "missing parts with content string",
				input: { role: "user", content: "plain" },
				expectedParts: [{ text: "plain" }],
			},
			{
				label: "missing parts with empty content",
				input: { role: "user", content: "" },
				expectedParts: [{ text: "" }],
			},
			{
				label: "missing parts with undefined content",
				input: { role: "user" },
				expectedParts: [{ text: "" }],
			},
			{
				label: "null parts with content",
				input: { role: "assistant", parts: null, content: "via-content" },
				expectedParts: [{ text: "via-content" }],
			},
			{
				label: "undefined parts with null content",
				input: { role: "user", parts: undefined, content: null },
				expectedParts: [{ text: "" }],
			},
		];

		for (const { label, input, expectedParts } of convertPartsCases) {
			it(`convertContents defaults parts when ${label}`, () => {
				const llm = new GoogleLlm();
				const converted = (llm as any).convertContents([input]);
				expect(converted[0].parts).toEqual(expectedParts);
				expect(converted[0].role).toBe(
					input.role === "assistant" ? "model" : input.role,
				);
			});
		}
	});

	describe("AiSdkLlm convertToAiSdkMessages contents || []", () => {
		let llm: AiSdkLlm;

		beforeEach(() => {
			vi.clearAllMocks();
			llm = new AiSdkLlm(makeAiModel());
		});

		const missingContentsCases: Array<{
			label: string;
			build: () => LlmRequest;
		}> = [
			{
				label: "undefined",
				build: () => new LlmRequest({ contents: undefined as any }),
			},
			{
				label: "null",
				build: () => new LlmRequest({ contents: null as any }),
			},
			{
				label: "omitted field",
				build: () => {
					const req = new LlmRequest({});
					delete (req as any).contents;
					return req;
				},
			},
		];

		for (const { label, build } of missingContentsCases) {
			it(`convertToAiSdkMessages coalesces ${label} to empty messages`, () => {
				expect((llm as any).convertToAiSdkMessages(build())).toEqual([]);
			});
		}

		it("generateContentAsyncImpl non-stream tolerates omitted contents", async () => {
			generateText.mockResolvedValue({
				text: "ok",
				toolCalls: [],
				finishReason: "stop",
				usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			});
			const req = new LlmRequest({});
			delete (req as any).contents;
			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				req,
				false,
			)) {
				responses.push(response);
			}
			expect(responses).toHaveLength(1);
			expect(generateText).toHaveBeenCalledWith(
				expect.objectContaining({ messages: [] }),
			);
		});
	});

	describe("LlmRequest.getSystemInstructionText coalesce leftovers", () => {
		const nonContentCases: Array<{
			label: string;
			value: unknown;
			expected: string;
		}> = [
			{ label: "number", value: 42, expected: "42" },
			{ label: "boolean true", value: true, expected: "true" },
			{
				label: "boolean false via getter",
				value: "FALSE_GETTER",
				expected: "",
			},
			{
				label: "object without parts",
				value: { role: "system" },
				expected: "[object Object]",
			},
			{ label: "array", value: [1, 2], expected: "1,2" },
			{ label: "symbol", value: Symbol.for("sys"), expected: "Symbol(sys)" },
		];

		for (const { label, value, expected } of nonContentCases) {
			it(`String()-coerces ${label} systemInstruction`, () => {
				const req = new LlmRequest();
				if (value === "FALSE_GETTER") {
					let n = 0;
					req.config = {
						get systemInstruction() {
							n += 1;
							return n === 1 ? true : false;
						},
					} as any;
					expect(req.getSystemInstructionText()).toBe("");
					return;
				}
				req.config = { systemInstruction: value as any };
				expect(req.getSystemInstructionText()).toBe(expected);
			});
		}

		const falsyInnerCases = [
			{ label: "empty string on second read", second: "" },
			{ label: "0 on second read", second: 0 },
			{ label: "null on second read", second: null },
			{ label: "undefined on second read", second: undefined },
		];

		for (const { label, second } of falsyInnerCases) {
			it(`hits String(systemInstruction || "") when ${label}`, () => {
				const req = new LlmRequest();
				let n = 0;
				req.config = {
					get systemInstruction() {
						n += 1;
						return n === 1 ? { role: "system" } : second;
					},
				} as any;
				expect(req.getSystemInstructionText()).toBe("");
			});
		}

		it("Content with parts undefined falls through to String(object)", () => {
			const req = new LlmRequest();
			req.config = {
				systemInstruction: { parts: undefined } as any,
			};
			expect(req.getSystemInstructionText()).toBe("[object Object]");
		});

		it("Content with null parts falls through to String(object)", () => {
			const req = new LlmRequest();
			req.config = {
				systemInstruction: { parts: null } as any,
			};
			expect(req.getSystemInstructionText()).toBe("[object Object]");
		});
	});
});
