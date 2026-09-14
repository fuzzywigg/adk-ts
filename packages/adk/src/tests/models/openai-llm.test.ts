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
	default: vi.fn(() => {
		return {
			chat: {
				completions: {
					create: vi.fn(),
				},
			},
		};
	}),
}));

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
				anyOf: [{ type: "NULL" }, { type: "STRING" }],
			});

			expect(transformed.type).toBe("object");
			expect(transformed.properties.name.type).toBe("string");
			expect(transformed.properties.tags.type).toBe("array");
			expect(transformed.properties.tags.items.type).toBe("string");
			expect(transformed.anyOf.map((s: any) => s.type)).toEqual([
				"null",
				"string",
			]);
			expect((llm as any).transformSchemaForOpenAi(["x", 1])).toEqual(["x", 1]);
			expect((llm as any).transformSchemaForOpenAi(null)).toBeNull();
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
		function baseRequest(
			overrides: Partial<LlmRequest> & Record<string, unknown> = {},
		): LlmRequest {
			return new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: {
					maxOutputTokens: 64,
					temperature: 0.2,
					topP: 0.8,
				},
				...overrides,
			});
		}

		it("yields a non-stream response with tools system and usage", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: {
							content: "pong",
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
				],
				usage: {
					prompt_tokens: 3,
					completion_tokens: 5,
					total_tokens: 8,
				},
			});

			const request = baseRequest({
				model: "gpt-4o",
				config: {
					systemInstruction: "be brief",
					maxOutputTokens: 32,
					temperature: 0.1,
					topP: 0.5,
					tools: [
						{
							functionDeclarations: [
								{
									name: "lookup",
									description: "Find things",
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

			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				request,
				false,
			)) {
				responses.push(response);
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gpt-4o",
					stream: false,
					tool_choice: "auto",
					max_tokens: 32,
					temperature: 0.1,
					top_p: 0.5,
					messages: expect.arrayContaining([
						{ role: "system", content: "be brief" },
						{ role: "user", content: "hi" },
					]),
					tools: [
						{
							type: "function",
							function: {
								name: "lookup",
								description: "Find things",
								parameters: {
									type: "object",
									properties: { q: { type: "string" } },
								},
							},
						},
					],
				}),
			);
			expect(responses).toHaveLength(1);
			expect(responses[0].content?.parts?.[0]).toEqual({ text: "pong" });
			expect(responses[0].content?.parts?.[1]?.functionCall).toEqual({
				id: "tc1",
				name: "lookup",
				args: { q: "adk" },
			});
			expect(responses[0].finishReason).toBe("STOP");
			expect(responses[0].usageMetadata).toEqual({
				promptTokenCount: 3,
				candidatesTokenCount: 5,
				totalTokenCount: 8,
			});
		});

		it("yields nothing when non-stream choices are empty", async () => {
			mockCreate.mockResolvedValue({ choices: [], usage: undefined });

			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest(),
				false,
			)) {
				responses.push(response);
			}

			expect(responses).toHaveLength(0);
		});

		it("streams partial text then finish_reason with leftover usage yield", async () => {
			mockCreate.mockResolvedValue(
				(async function* () {
					yield {
						choices: [{ delta: { content: "Hel" }, finish_reason: null }],
					};
					yield {
						choices: [{ delta: { content: "lo" }, finish_reason: "stop" }],
						usage: {
							prompt_tokens: 1,
							completion_tokens: 2,
							total_tokens: 3,
						},
					};
				})(),
			);

			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest(),
				true,
			)) {
				responses.push(response);
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({ stream: true, model: "gpt-4o-mini" }),
			);
			expect(responses[0].partial).toBe(true);
			expect(responses[0].content?.parts?.[0]?.text).toBe("Hel");
			const finished = responses.find((r) => r.finishReason === "STOP");
			expect(finished?.content?.parts).toEqual([{ text: "Hello" }]);
			expect(finished?.usageMetadata?.totalTokenCount).toBe(3);
			expect(
				responses.some(
					(r) =>
						!r.partial &&
						!r.finishReason &&
						r.content?.parts?.[0]?.text === "Hello" &&
						r.usageMetadata?.totalTokenCount === 3,
				),
			).toBe(true);
		});

		it("merges accumulated text when a later chunk clears content", async () => {
			mockCreate.mockResolvedValue(
				(async function* () {
					yield {
						choices: [
							{ delta: { content: "[thinking] draft" }, finish_reason: null },
						],
					};
					yield {
						choices: [{ delta: { content: "answer" }, finish_reason: null }],
					};
					yield {
						choices: [{ delta: {}, finish_reason: null }],
						usage: {
							prompt_tokens: 2,
							completion_tokens: 4,
							total_tokens: 6,
						},
					};
					yield {
						choices: [{ delta: {}, finish_reason: "length" }],
					};
				})(),
			);

			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest(),
				true,
			)) {
				responses.push(response);
			}

			const merged = responses.find(
				(r) =>
					r.content?.parts?.some((p: any) => p.thought) &&
					r.content?.parts?.some((p: any) => p.text === "answer") &&
					!r.partial &&
					!r.finishReason,
			);
			expect(merged?.usageMetadata).toEqual({
				promptTokenCount: 2,
				candidatesTokenCount: 4,
				totalTokenCount: 6,
			});
			expect(responses.some((r) => r.finishReason === "MAX_TOKENS")).toBe(true);
		});

		it("accumulates streamed tool call fragments across indexes", async () => {
			mockCreate.mockResolvedValue(
				(async function* () {
					yield {
						choices: [
							{
								delta: {
									tool_calls: [
										{
											index: 0,
											id: "call-a",
											type: "function",
											function: { name: "look", arguments: "" },
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
								delta: {
									tool_calls: [
										{
											index: 0,
											function: { arguments: '{"q":' },
										},
										{
											index: 1,
											id: "call-b",
											type: "function",
											function: { name: "ping", arguments: "{}" },
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
								delta: {
									tool_calls: [
										{
											index: 0,
											function: { arguments: '"adk"}' },
										},
									],
								},
								finish_reason: "tool_calls",
							},
						],
						usage: {
							prompt_tokens: 4,
							completion_tokens: 6,
							total_tokens: 10,
						},
					};
				})(),
			);

			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest(),
				true,
			)) {
				responses.push(response);
			}

			const final = responses.find((r) => r.finishReason === "STOP");
			expect(final?.content?.parts).toEqual([
				{
					functionCall: {
						id: "call-a",
						name: "look",
						args: { q: "adk" },
					},
				},
				{
					functionCall: {
						id: "call-b",
						name: "ping",
						args: {},
					},
				},
			]);
			expect(final?.usageMetadata?.totalTokenCount).toBe(10);
		});

		it("skips empty stream choices and omits tool_choice without tools", async () => {
			mockCreate.mockResolvedValue(
				(async function* () {
					yield { choices: [] };
					yield {
						choices: [{ delta: { content: "only" }, finish_reason: "stop" }],
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
				baseRequest(),
				true,
			)) {
				responses.push(response);
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					tools: undefined,
					tool_choice: undefined,
				}),
			);
			expect(responses.some((r) => r.finishReason === "STOP")).toBe(true);
			expect(
				responses.some((r) => r.content?.parts?.[0]?.text === "only"),
			).toBe(true);
		});

		it("uses instance model when request.model is omitted", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: { content: "ok" },
						finish_reason: "stop",
					},
				],
			});

			const request = new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			});
			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				request,
				false,
			)) {
				responses.push(response);
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({ model: "gpt-4o-mini", stream: false }),
			);
			expect(responses[0].content?.parts?.[0]).toEqual({ text: "ok" });
			expect(responses[0].usageMetadata).toBeUndefined();
			expect(responses[0].finishReason).toBe("STOP");
		});

		it("maps empty contents and skips system instruction when absent", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: { content: null, tool_calls: [] },
						finish_reason: "stop",
					},
				],
				usage: undefined,
			});

			const request = new LlmRequest({ contents: undefined as any });
			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				request,
				false,
			)) {
				responses.push(response);
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: [],
					tools: undefined,
					tool_choice: undefined,
				}),
			);
			expect(responses).toHaveLength(1);
			expect(responses[0].content?.parts).toEqual([]);
		});

		it("skips non-function tool_calls in non-stream responses", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: {
							content: "text",
							tool_calls: [
								{ id: "x", type: "custom", custom: {} },
								{
									id: "fn1",
									type: "function",
									function: { name: "noop", arguments: "" },
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
			});

			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest(),
				false,
			)) {
				responses.push(response);
			}

			expect(responses[0].content?.parts).toEqual([
				{ text: "text" },
				{ functionCall: { id: "fn1", name: "noop", args: {} } },
			]);
		});

		it("streams thought partials and omits nameless tool calls on finish", async () => {
			mockCreate.mockResolvedValue(
				(async function* () {
					yield {
						choices: [
							{
								delta: { content: "<thinking>plan" },
								finish_reason: null,
							},
						],
					};
					yield {
						choices: [
							{
								delta: {
									tool_calls: [
										{
											index: 0,
											id: "orphan",
											type: "function",
											function: { name: "", arguments: "{}" },
										},
									],
								},
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
				baseRequest(),
				true,
			)) {
				responses.push(response);
			}

			expect(
				responses.some(
					(r) =>
						r.partial === true &&
						r.content?.parts?.[0]?.text === "<thinking>plan" &&
						(r.content?.parts?.[0] as any)?.thought === true,
				),
			).toBe(true);
			const finished = responses.find((r) => r.finishReason === "STOP");
			expect(
				finished?.content?.parts?.some((p: any) => p.functionCall),
			).toBeFalsy();
			expect(finished?.usageMetadata?.totalTokenCount).toBe(5);
		});

		it("skips merge yield when hasInlineData reports true on a tool-call chunk", async () => {
			const hasInline = vi
				.spyOn(llm as any, "hasInlineData")
				.mockReturnValue(true);

			mockCreate.mockResolvedValue(
				(async function* () {
					yield {
						choices: [{ delta: { content: "partial" }, finish_reason: null }],
					};
					yield {
						choices: [
							{
								delta: {
									tool_calls: [
										{
											id: "img",
											type: "function",
											function: { name: "noop", arguments: "{}" },
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

			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest(),
				true,
			)) {
				responses.push(response);
			}

			expect(hasInline).toHaveBeenCalled();
			const finished = responses.find((r) => r.finishReason === "STOP");
			// Merge was skipped, so finish_reason still sees the buffered "partial" text.
			expect(finished?.content?.parts).toEqual([
				{ text: "partial" },
				{ functionCall: { id: "img", name: "noop", args: {} } },
			]);
			hasInline.mockRestore();
		});

		it("defaults tool_call index to 0 and empty id when omitted", async () => {
			mockCreate.mockResolvedValue(
				(async function* () {
					yield {
						choices: [
							{
								delta: {
									tool_calls: [
										{
											// omit type so createChunkResponse skips JSON.parse on partial args
											function: { name: "alpha", arguments: '{"a":' },
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
								delta: {
									tool_calls: [
										{
											function: { arguments: "1}" },
										},
									],
								},
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
				baseRequest(),
				true,
			)) {
				responses.push(response);
			}

			const final = responses.find((r) => r.finishReason === "STOP");
			expect(final?.content?.parts).toEqual([
				{ functionCall: { id: "", name: "alpha", args: { a: 1 } } },
			]);
		});

		it("omits leftover yield when stream ends without usageMetadata", async () => {
			mockCreate.mockResolvedValue(
				(async function* () {
					yield {
						choices: [{ delta: { content: "keep" }, finish_reason: null }],
					};
					yield {
						choices: [{ delta: {}, finish_reason: "stop" }],
					};
				})(),
			);

			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest(),
				true,
			)) {
				responses.push(response);
			}

			expect(responses.some((r) => r.finishReason === "STOP")).toBe(true);
			expect(
				responses.filter(
					(r) =>
						!r.partial &&
						!r.finishReason &&
						r.usageMetadata &&
						r.content?.parts?.[0]?.text === "keep",
				),
			).toHaveLength(0);
		});

		it("yields leftover thought+text when finish clears buffers then usage remains", async () => {
			mockCreate.mockResolvedValue(
				(async function* () {
					yield {
						choices: [
							{
								delta: { content: "[thinking] t" },
								finish_reason: null,
							},
						],
					};
					yield {
						choices: [{ delta: { content: "out" }, finish_reason: null }],
					};
					yield {
						choices: [{ delta: {}, finish_reason: null }],
						usage: {
							prompt_tokens: 9,
							completion_tokens: 8,
							total_tokens: 17,
						},
					};
					// After merge, buffers are cleared; finish with no leftover text
					yield {
						choices: [{ delta: {}, finish_reason: "stop" }],
					};
				})(),
			);

			const responses: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest(),
				true,
			)) {
				responses.push(response);
			}

			const merged = responses.find(
				(r) =>
					!r.partial &&
					!r.finishReason &&
					r.content?.parts?.some((p: any) => p.thought) &&
					r.content?.parts?.some((p: any) => p.text === "out"),
			);
			expect(merged?.usageMetadata?.totalTokenCount).toBe(17);
			expect(responses.some((r) => r.finishReason === "STOP")).toBe(true);
		});

		it("passes config temperature/topP/max tokens as undefined when omitted", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "x" }, finish_reason: "stop" }],
			});

			const request = new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: {},
			});
			for await (const _ of (llm as any).generateContentAsyncImpl(
				request,
				false,
			)) {
				// drain
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					max_tokens: undefined,
					temperature: undefined,
					top_p: undefined,
				}),
			);
		});
	});

	describe("contentToOpenAiMessage leftovers", () => {
		it("uses empty string for system content without parts", () => {
			expect((llm as any).contentToOpenAiMessage({ role: "system" })).toEqual({
				role: "system",
				content: "",
			});
		});

		it("maps model role text to assistant", () => {
			expect(
				(llm as any).contentToOpenAiMessage({
					role: "model",
					parts: [{ text: "reply" }],
				}),
			).toEqual({ role: "assistant", content: "reply" });
		});

		it("defaults missing functionCall id/args and functionResponse fields", () => {
			expect(
				(llm as any).contentToOpenAiMessage({
					parts: [{ functionCall: { name: "f" } }],
				}),
			).toEqual({
				role: "assistant",
				tool_calls: [
					{
						id: "",
						type: "function",
						function: { name: "f", arguments: "{}" },
					},
				],
			});

			expect(
				(llm as any).contentToOpenAiMessage({
					parts: [{ functionResponse: {} }],
				}),
			).toEqual({
				role: "tool",
				tool_call_id: "",
				content: "{}",
			});
		});

		it("maps undefined parts to empty multi-part content array", () => {
			expect((llm as any).contentToOpenAiMessage({ role: "user" })).toEqual({
				role: "user",
				content: [],
			});
		});

		it("converts multi-part with inline_data image parts", () => {
			expect(
				(llm as any).contentToOpenAiMessage({
					role: "user",
					parts: [
						{ text: "caption" },
						{ inline_data: { mime_type: "image/jpeg", data: "abc" } },
					],
				}),
			).toEqual({
				role: "user",
				content: [
					{ type: "text", text: "caption" },
					{
						type: "image_url",
						image_url: { url: "data:image/jpeg;base64,abc" },
					},
				],
			});
		});
	});

	describe("schema and helper leftovers", () => {
		it("transformSchemaForOpenAi handles oneOf/allOf and non-string types", () => {
			const transformed = (llm as any).transformSchemaForOpenAi({
				type: 42,
				oneOf: [{ type: "NUMBER" }],
				allOf: [{ type: "BOOLEAN" }],
				items: [{ type: "INTEGER" }, "raw"],
			});
			expect(transformed.type).toBe(42);
			expect(transformed.oneOf[0].type).toBe("number");
			expect(transformed.allOf[0].type).toBe("boolean");
			expect(transformed.items[0].type).toBe("integer");
			expect(transformed.items[1]).toBe("raw");
			expect((llm as any).transformSchemaForOpenAi(undefined)).toBeUndefined();
			expect((llm as any).transformSchemaForOpenAi("plain")).toBe("plain");
		});

		it("functionDeclarationToOpenAiTool defaults empty description and params", () => {
			expect(
				(llm as any).functionDeclarationToOpenAiTool({ name: "bare" }),
			).toEqual({
				type: "function",
				function: {
					name: "bare",
					description: "",
					parameters: {},
				},
			});
		});

		it("openAiMessageToLlmResponse omits usage and skips non-function calls", () => {
			const response = (llm as any).openAiMessageToLlmResponse({
				message: {
					content: "",
					tool_calls: [
						{ id: "c", type: "custom" },
						{
							id: "f",
							type: "function",
							function: { name: "g", arguments: "{}" },
						},
					],
				},
				finish_reason: "length",
			});
			expect(response.usageMetadata).toBeUndefined();
			expect(response.finishReason).toBe("MAX_TOKENS");
			expect(response.content?.parts).toEqual([
				{ functionCall: { id: "f", name: "g", args: {} } },
			]);
		});

		it("createChunkResponse maps regular text and defaults tool call fields", () => {
			const regular = (llm as any).createChunkResponse({ content: "hello" });
			expect(regular.content?.parts?.[0]).toEqual({ text: "hello" });
			expect(regular.usageMetadata).toBeUndefined();

			const tools = (llm as any).createChunkResponse({
				tool_calls: [
					{ type: "custom" },
					{
						type: "function",
						function: { name: "n" },
					},
				],
			});
			expect(tools.content?.parts).toEqual([
				{ functionCall: { id: "", name: "n", args: {} } },
			]);
		});

		it("preprocessRequest no-ops without config and skips contents without parts", () => {
			const bare = {} as any;
			expect(() => (llm as any).preprocessRequest(bare)).not.toThrow();

			const req = {
				config: {},
				contents: [{ role: "user" }, { parts: [{ text: "x" }] }],
			};
			(llm as any).preprocessRequest(req);
			expect(req.contents[1].parts[0]).toEqual({ text: "x" });
		});

		it("preprocessPart deletes inline_data missing mime_type", () => {
			const part = { inline_data: { data: "abc" } };
			(llm as any).preprocessPart(part);
			expect(part.inline_data).toBeUndefined();
		});

		it("hasInlineData is false for missing content or parts", () => {
			expect((llm as any).hasInlineData(new LlmResponse({}))).toBe(false);
			expect(
				(llm as any).hasInlineData(
					new LlmResponse({ content: { role: "model" } as any }),
				),
			).toBe(false);
		});

		it("reuses the cached OpenAI client instance", () => {
			const first = (llm as any).client;
			const second = (llm as any).client;
			expect(first).toBe(second);
			expect(OpenAI).toHaveBeenCalledTimes(1);
		});

		it("connect error includes the custom model name", () => {
			const custom = new OpenAiLlm("gpt-4.1");
			expect(() => custom.connect({} as any)).toThrow(
				"Live connection is not supported for gpt-4.1.",
			);
		});
	});
});
