import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
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

async function* asAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
	for (const item of items) {
		yield item;
	}
}

describe("OpenAiLlm", () => {
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

	it("should set model in constructor", () => {
		expect(llm.model).toBe("gpt-4o-mini");
		const custom = new OpenAiLlm("gpt-3.5-turbo");
		expect(custom.model).toBe("gpt-3.5-turbo");
	});

	it("supportedModels returns expected patterns", () => {
		expect(OpenAiLlm.supportedModels()).toEqual([
			"gpt-3.5-.*",
			"gpt-4.*",
			"gpt-4o.*",
			"gpt-5.*",
			"o1-.*",
			"o3-.*",
		]);
	});

	describe("contentToOpenAiMessage", () => {
		it("should convert system content", () => {
			const content = { role: "system", parts: [{ text: "sys" }] };
			const msg = (llm as any).contentToOpenAiMessage(content);
			expect(msg).toEqual({ role: "system", content: "sys" });
		});

		it("should convert function call part", () => {
			const content = {
				parts: [
					{
						functionCall: {
							id: "id1",
							name: "foo",
							args: { a: 1 },
						},
					},
				],
			};
			const msg = (llm as any).contentToOpenAiMessage(content);
			expect(msg).toEqual({
				role: "assistant",
				tool_calls: [
					{
						id: "id1",
						type: "function",
						function: {
							name: "foo",
							arguments: JSON.stringify({ a: 1 }),
						},
					},
				],
			});
		});

		it("should convert function response part", () => {
			const content = {
				parts: [
					{
						functionResponse: {
							id: "id2",
							response: { b: 2 },
						},
					},
				],
			};
			const msg = (llm as any).contentToOpenAiMessage(content);
			expect(msg).toEqual({
				role: "tool",
				tool_call_id: "id2",
				content: JSON.stringify({ b: 2 }),
			});
		});

		it("should convert single text part", () => {
			const content = { role: "user", parts: [{ text: "hi" }] };
			const msg = (llm as any).contentToOpenAiMessage(content);
			expect(msg).toEqual({ role: "user", content: "hi" });
		});

		it("should convert multi-part content", () => {
			const content = {
				role: "user",
				parts: [{ text: "a" }, { text: "b" }],
			};
			const msg = (llm as any).contentToOpenAiMessage(content);
			expect(msg).toEqual({
				role: "user",
				content: [
					{ type: "text", text: "a" },
					{ type: "text", text: "b" },
				],
			});
		});
	});

	describe("partToOpenAiContent", () => {
		it("should convert text part", () => {
			const part = { text: "foo" };
			const res = (llm as any).partToOpenAiContent(part);
			expect(res).toEqual({ type: "text", text: "foo" });
		});

		it("should convert inline_data part", () => {
			const part = {
				inline_data: { mime_type: "image/png", data: "abc123" },
			};
			const res = (llm as any).partToOpenAiContent(part);
			expect(res).toEqual({
				type: "image_url",
				image_url: {
					url: "data:image/png;base64,abc123",
				},
			});
		});

		it("should throw on unsupported part", () => {
			expect(() => (llm as any).partToOpenAiContent({})).toThrow(
				"Unsupported part type for OpenAI conversion",
			);
		});
	});

	describe("toOpenAiRole", () => {
		it("should map model to assistant", () => {
			expect((llm as any).toOpenAiRole("model")).toBe("assistant");
		});
		it("should map system to system", () => {
			expect((llm as any).toOpenAiRole("system")).toBe("system");
		});
		it("should default to user", () => {
			expect((llm as any).toOpenAiRole("foo")).toBe("user");
			expect((llm as any).toOpenAiRole(undefined)).toBe("user");
		});
	});

	describe("toAdkFinishReason", () => {
		it("should map stop/tool_calls to STOP", () => {
			expect((llm as any).toAdkFinishReason("stop")).toBe("STOP");
			expect((llm as any).toAdkFinishReason("tool_calls")).toBe("STOP");
		});
		it("should map length to MAX_TOKENS", () => {
			expect((llm as any).toAdkFinishReason("length")).toBe("MAX_TOKENS");
		});
		it("should default to FINISH_REASON_UNSPECIFIED", () => {
			expect((llm as any).toAdkFinishReason("other")).toBe(
				"FINISH_REASON_UNSPECIFIED",
			);
			expect((llm as any).toAdkFinishReason(undefined)).toBe(
				"FINISH_REASON_UNSPECIFIED",
			);
		});
	});

	describe("getContentType", () => {
		it("should detect thought content", () => {
			expect((llm as any).getContentType("[thinking] foo")).toBe("thought");
			expect((llm as any).getContentType("<thinking>bar")).toBe("thought");
		});
		it("should default to regular", () => {
			expect((llm as any).getContentType("hello")).toBe("regular");
		});
	});

	describe("preprocessPart", () => {
		it("should remove invalid inline_data", () => {
			const part = { inline_data: { mime_type: "image/png" } };
			(llm as any).preprocessPart(part);
			expect(part.inline_data).toBeUndefined();
		});
		it("should keep valid inline_data", () => {
			const part = { inline_data: { mime_type: "image/png", data: "abc" } };
			(llm as any).preprocessPart(part);
			expect(part.inline_data).toEqual({ mime_type: "image/png", data: "abc" });
		});
		it("should not throw if no inline_data", () => {
			expect(() => (llm as any).preprocessPart({})).not.toThrow();
		});
	});

	describe("hasInlineData", () => {
		it("should detect inlineData in parts", () => {
			const resp = new LlmResponse({
				content: { parts: [{ inlineData: true }] } as any,
			});
			expect((llm as any).hasInlineData(resp)).toBe(true);
		});
		it("should return false if no inlineData", () => {
			const resp = new LlmResponse({
				content: { parts: [{ text: "hi" }] } as any,
			});
			expect((llm as any).hasInlineData(resp)).toBe(false);
		});
	});

	describe("client getter", () => {
		it("should throw if OPENAI_API_KEY is not set", () => {
			process.env.OPENAI_API_KEY = undefined;
			const llm2 = new OpenAiLlm();
			expect(() => (llm2 as any).client).toThrow(
				/OPENAI_API_KEY environment variable is required/,
			);
		});

		it("should return a client if OPENAI_API_KEY is set", () => {
			process.env.OPENAI_API_KEY = "test-key";
			const llm2 = new OpenAiLlm();
			expect((llm2 as any).client).toBeDefined();
		});
	});

	describe("connect", () => {
		it("should throw error", () => {
			expect(() => llm.connect({} as any)).toThrow(
				"Live connection is not supported for gpt-4o-mini.",
			);
		});
	});

	describe("schema and response helpers", () => {
		it("transformSchemaForOpenAi lowercases nested types and keywords", () => {
			const transformed = (llm as any).transformSchemaForOpenAi({
				type: "OBJECT",
				properties: {
					name: { type: "STRING" },
					tags: { type: "ARRAY", items: { type: "STRING" } },
				},
				anyOf: [{ type: "NUMBER" }, { type: "NULL" }],
			});

			expect(transformed.type).toBe("object");
			expect(transformed.properties.name.type).toBe("string");
			expect(transformed.properties.tags.type).toBe("array");
			expect(transformed.properties.tags.items.type).toBe("string");
			expect(transformed.anyOf.map((s: any) => s.type)).toEqual([
				"number",
				"null",
			]);
			expect(
				(llm as any).transformSchemaForOpenAi([{ type: "STRING" }]),
			).toEqual([{ type: "string" }]);
			expect((llm as any).transformSchemaForOpenAi(["x", 1])).toEqual(["x", 1]);
			expect((llm as any).transformSchemaForOpenAi(null)).toBeNull();
			expect((llm as any).transformSchemaForOpenAi("x")).toBe("x");
		});

		it("functionDeclarationToOpenAiTool maps name description and params", () => {
			const tool = (llm as any).functionDeclarationToOpenAiTool({
				name: "lookup",
				description: "Find things",
				parameters: {
					type: "OBJECT",
					properties: { q: { type: "STRING" } },
				},
			});

			expect(tool).toEqual({
				type: "function",
				function: {
					name: "lookup",
					description: "Find things",
					parameters: {
						type: "object",
						properties: { q: { type: "string" } },
					},
				},
			});
		});

		it("functionDeclarationToOpenAiTool defaults missing description", () => {
			expect(
				(llm as any).functionDeclarationToOpenAiTool({
					name: "lookup",
					parameters: {
						type: "OBJECT",
						properties: { q: { type: "STRING" } },
					},
				}),
			).toEqual({
				type: "function",
				function: {
					name: "lookup",
					description: "",
					parameters: {
						type: "object",
						properties: { q: { type: "string" } },
					},
				},
			});
		});

		it("openAiMessageToLlmResponse maps text, tool_calls, and usage", () => {
			const response = (llm as any).openAiMessageToLlmResponse(
				{
					message: {
						content: "hello",
						tool_calls: [
							{
								id: "tc1",
								type: "function",
								function: {
									name: "lookup",
									arguments: JSON.stringify({ q: "adk" }),
								},
							},
						],
					},
					finish_reason: "tool_calls",
				},
				{ prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
			);

			expect(response.content?.parts?.[0]).toEqual({ text: "hello" });
			expect(response.content?.parts?.[1]?.functionCall).toEqual({
				id: "tc1",
				name: "lookup",
				args: { q: "adk" },
			});
			expect(response.usageMetadata).toEqual({
				promptTokenCount: 3,
				candidatesTokenCount: 5,
				totalTokenCount: 8,
			});
			expect(response.finishReason).toBe("STOP");
		});

		it("createChunkResponse handles thought text and tool call deltas", () => {
			const thought = (llm as any).createChunkResponse({
				content: "[thinking] draft",
			});
			expect(thought.content?.parts?.[0]).toEqual({
				text: "[thinking] draft",
				thought: true,
			});

			const tools = (llm as any).createChunkResponse(
				{
					tool_calls: [
						{
							id: "d1",
							type: "function",
							function: { name: "search", arguments: '{"q":1}' },
						},
					],
				},
				{ prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
			);
			expect(tools.content?.parts?.[0]?.functionCall).toEqual({
				id: "d1",
				name: "search",
				args: { q: 1 },
			});
			expect(tools.usageMetadata?.totalTokenCount).toBe(3);

			const empty = (llm as any).createChunkResponse({});
			expect(empty.content).toBeUndefined();
		});

		it("preprocessRequest clears labels and walks contents", () => {
			const req = {
				config: { labels: { env: "test" } },
				contents: [
					{
						parts: [
							{ inline_data: { mime_type: "image/png" } },
							{ text: "keep" },
						],
					},
				],
			};
			(llm as any).preprocessRequest(req);
			expect(req.config.labels).toBeUndefined();
			expect(req.contents[0].parts[0].inline_data).toBeUndefined();
			expect(req.contents[0].parts[1]).toEqual({ text: "keep" });
		});
	});

	describe("generateContentAsyncImpl", () => {
		const baseRequest = {
			contents: [{ role: "user", parts: [{ text: "Hello" }] }],
			config: {
				maxOutputTokens: 100,
				temperature: 0.5,
				topP: 0.9,
			},
			getSystemInstructionText: () => "",
		};

		it("yields a non-stream text response with usage", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: { content: "Hi there", role: "assistant" },
						finish_reason: "stop",
					},
				],
				usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
			});

			const results: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest,
			)) {
				results.push(response);
			}

			expect(results).toHaveLength(1);
			expect(results[0]).toBeInstanceOf(LlmResponse);
			expect(results[0].content?.parts).toEqual([{ text: "Hi there" }]);
			expect(results[0].usageMetadata).toEqual({
				promptTokenCount: 3,
				candidatesTokenCount: 5,
				totalTokenCount: 8,
			});
			expect(results[0].finishReason).toBe("STOP");
		});

		it("completes without yielding when choices are empty", async () => {
			mockCreate.mockResolvedValue({ choices: [], usage: undefined });

			const results: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest,
			)) {
				results.push(response);
			}

			expect(results).toHaveLength(0);
		});

		it("maps non-stream tool_calls into functionCall parts", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: {
							role: "assistant",
							content: null,
							tool_calls: [
								{
									id: "call-1",
									type: "function",
									function: {
										name: "search",
										arguments: '{"q":"adk"}',
									},
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
			});

			const results: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest,
			)) {
				results.push(response);
			}

			expect(results[0].content?.parts).toEqual([
				{
					functionCall: {
						id: "call-1",
						name: "search",
						args: { q: "adk" },
					},
				},
			]);
			expect(results[0].finishReason).toBe("STOP");
		});

		it("prepends system instruction and attaches tools", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: { content: "ok", role: "assistant" },
						finish_reason: "stop",
					},
				],
			});

			const request = {
				...baseRequest,
				model: "gpt-4o",
				getSystemInstructionText: () => "Be brief",
				config: {
					...baseRequest.config,
					tools: [
						{
							functionDeclarations: [
								{
									name: "ping",
									description: "Ping tool",
									parameters: {
										type: "OBJECT",
										properties: { n: { type: "NUMBER" } },
									},
								},
							],
						},
					],
				},
			};

			for await (const _ of (llm as any).generateContentAsyncImpl(request)) {
				/* drain */
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gpt-4o",
					stream: false,
					tool_choice: "auto",
					messages: expect.arrayContaining([
						{ role: "system", content: "Be brief" },
						{ role: "user", content: "Hello" },
					]),
					tools: [
						{
							type: "function",
							function: {
								name: "ping",
								description: "Ping tool",
								parameters: {
									type: "object",
									properties: { n: { type: "number" } },
								},
							},
						},
					],
				}),
			);
		});

		it("omits tools and tool_choice when no declarations", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: { content: "ok", role: "assistant" },
						finish_reason: "stop",
					},
				],
			});

			for await (const _ of (llm as any).generateContentAsyncImpl(
				baseRequest,
			)) {
				/* drain */
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					tools: undefined,
					tool_choice: undefined,
				}),
			);
		});

		it("clears config.labels during preprocess", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: { content: "ok", role: "assistant" },
						finish_reason: "stop",
					},
				],
			});
			const request = {
				...baseRequest,
				config: { ...baseRequest.config, labels: { a: "b" } },
			};

			for await (const _ of (llm as any).generateContentAsyncImpl(request)) {
				/* drain */
			}

			expect((request.config as any).labels).toBeUndefined();
		});

		it("streams text partials then a STOP final response", async () => {
			mockCreate.mockResolvedValue(
				asAsyncIterable([
					{
						choices: [{ delta: { content: "Hel" }, finish_reason: null }],
					},
					{
						choices: [
							{
								delta: { content: "lo" },
								finish_reason: "stop",
							},
						],
						usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
					},
				]),
			);

			const results: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest,
				true,
			)) {
				results.push(response);
			}

			expect(results.some((r) => r.partial === true)).toBe(true);
			const final = results.find((r) => r.finishReason === "STOP");
			expect(final).toBeTruthy();
			expect(final?.content?.parts).toEqual([{ text: "Hello" }]);
			expect(results.some((r) => r.usageMetadata?.totalTokenCount === 3)).toBe(
				true,
			);
		});

		it("marks [thinking] stream content as thought parts", async () => {
			mockCreate.mockResolvedValue(
				asAsyncIterable([
					{
						choices: [
							{
								delta: { content: "[thinking] plan" },
								finish_reason: null,
							},
						],
					},
					{
						choices: [
							{
								delta: { content: " answer" },
								finish_reason: "stop",
							},
						],
					},
				]),
			);

			const results: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest,
				true,
			)) {
				results.push(response);
			}

			const final = results[results.length - 1];
			expect(final.content?.parts).toEqual([
				{ text: "[thinking] plan", thought: true },
				{ text: " answer" },
			]);
		});

		it("accumulates split tool_call deltas into a final functionCall", async () => {
			mockCreate.mockResolvedValue(
				asAsyncIterable([
					{
						choices: [
							{
								delta: {
									tool_calls: [
										{
											index: 0,
											id: "tc1",
											type: "function",
											function: { name: "sea", arguments: "" },
										},
									],
								},
								finish_reason: null,
							},
						],
					},
					{
						choices: [
							{
								delta: {
									tool_calls: [
										{
											index: 0,
											function: { name: "rch", arguments: '{"q":' },
										},
									],
								},
								finish_reason: null,
							},
						],
					},
					{
						choices: [
							{
								delta: {
									tool_calls: [
										{
											index: 0,
											function: { arguments: '"x"}' },
										},
									],
								},
								finish_reason: "tool_calls",
							},
						],
					},
				]),
			);

			const results: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest,
				true,
			)) {
				results.push(response);
			}

			const final = results[results.length - 1];
			expect(final.finishReason).toBe("STOP");
			expect(final.content?.parts).toContainEqual({
				functionCall: {
					id: "tc1",
					name: "search",
					args: { q: "x" },
				},
			});
		});

		it("maps finish_reason length to MAX_TOKENS", async () => {
			mockCreate.mockResolvedValue(
				asAsyncIterable([
					{
						choices: [{ delta: { content: "cut" }, finish_reason: null }],
					},
					{
						choices: [{ delta: {}, finish_reason: "length" }],
					},
				]),
			);

			const results: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest,
				true,
			)) {
				results.push(response);
			}

			expect(results[results.length - 1].finishReason).toBe("MAX_TOKENS");
		});

		it("skips stream chunks with empty choices", async () => {
			mockCreate.mockResolvedValue(
				asAsyncIterable([
					{ choices: [] },
					{
						choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
					},
				]),
			);

			const results: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest,
				true,
			)) {
				results.push(response);
			}

			expect(results.length).toBeGreaterThan(0);
			expect(results[results.length - 1].finishReason).toBe("STOP");
		});

		it("yields merged buffered text when a non-text chunk arrives mid-stream", async () => {
			mockCreate.mockResolvedValue(
				asAsyncIterable([
					{
						choices: [{ delta: { content: "buffered" }, finish_reason: null }],
					},
					{
						choices: [{ delta: {}, finish_reason: null }],
						usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
					},
					{
						choices: [{ delta: {}, finish_reason: "stop" }],
					},
				]),
			);

			const results: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest,
				true,
			)) {
				results.push(response);
			}

			expect(
				results.some((r) =>
					r.content?.parts?.some((p: any) => p.text === "buffered"),
				),
			).toBe(true);
		});
	});
});
