import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Anthropic from "@anthropic-ai/sdk";
import { AnthropicLlm, type LlmRequest, LlmResponse } from "@adk/models";

vi.mock("@anthropic-ai/sdk");
vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

describe("AnthropicLlm", () => {
	let anthropicLlm: AnthropicLlm;
	const mockApiKey = "test-api-key";
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		vi.clearAllMocks();
		process.env.ANTHROPIC_API_KEY = mockApiKey;
		anthropicLlm = new AnthropicLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	describe("constructor", () => {
		it("should initialize with default model", () => {
			expect(anthropicLlm).toBeInstanceOf(AnthropicLlm);
			expect(anthropicLlm["model"]).toBe("claude-3-5-sonnet-20241022");
		});

		it("should initialize with custom model", () => {
			const customModel = "claude-3-custom-model";
			const llm = new AnthropicLlm(customModel);
			expect(llm["model"]).toBe(customModel);
		});
	});

	describe("supportedModels", () => {
		it("should return supported model patterns", () => {
			const supported = AnthropicLlm.supportedModels();
			expect(supported).toEqual(["claude-3-.*", "claude-.*-4.*"]);
		});
	});

	describe("generateContentAsyncImpl", () => {
		const mockLlmRequest: LlmRequest = {
			contents: [
				{
					role: "user",
					parts: [{ text: "Hello" }],
				},
			],
			config: {
				maxOutputTokens: 500,
				temperature: 0.7,
				topP: 0.9,
			},
			getSystemInstructionText: vi.fn().mockReturnValue(""),
		} as unknown as LlmRequest;

		const mockAnthropicResponse = {
			content: [{ type: "text", text: "Hello there!" }],
			usage: {
				input_tokens: 10,
				output_tokens: 20,
			},
			stop_reason: "end_turn",
		};

		let mockMessagesCreate: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			mockMessagesCreate = vi.fn().mockResolvedValue(mockAnthropicResponse);
			(Anthropic as any).mockImplementation(() => ({
				messages: {
					create: mockMessagesCreate,
				},
			}));
		});

		it("should generate content with default model", async () => {
			const generator =
				anthropicLlm["generateContentAsyncImpl"](mockLlmRequest);
			const result = await generator.next();

			expect(result.value).toBeInstanceOf(LlmResponse);
			expect(result.done).toBe(false);

			const nextResult = await generator.next();
			expect(nextResult.done).toBe(true);
		});

		it("should generate content with custom model", async () => {
			const customModelRequest = {
				...mockLlmRequest,
				model: "claude-3-custom",
			};
			const generator = anthropicLlm["generateContentAsyncImpl"](
				customModelRequest as LlmRequest,
			);
			await generator.next();

			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "claude-3-custom",
				}),
			);
		});

		it("should include system instruction when provided", async () => {
			const requestWithSystem = {
				...mockLlmRequest,
				getSystemInstructionText: () => "Be helpful",
			};

			const generator = anthropicLlm["generateContentAsyncImpl"](
				requestWithSystem as LlmRequest,
			);
			await generator.next();

			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					system: "Be helpful",
				}),
			);
		});

		it("maps functionDeclarations into Anthropic tools with tool_choice auto", async () => {
			const requestWithTools = {
				...mockLlmRequest,
				config: {
					...mockLlmRequest.config,
					tools: [
						{
							functionDeclarations: [
								{
									name: "lookup",
									description: "Look something up",
									parameters: {
										properties: {
											q: { type: "STRING" },
										},
									},
								},
							],
						},
					],
				},
			};

			const generator = anthropicLlm["generateContentAsyncImpl"](
				requestWithTools as unknown as LlmRequest,
			);
			await generator.next();

			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					tools: [
						{
							name: "lookup",
							description: "Look something up",
							input_schema: {
								type: "object",
								properties: {
									q: { type: "string" },
								},
							},
						},
					],
					tool_choice: { type: "auto" },
				}),
			);
		});

		it("throws when streaming is requested", async () => {
			const generator = anthropicLlm["generateContentAsyncImpl"](
				mockLlmRequest,
				true,
			);
			await expect(generator.next()).rejects.toThrow(
				/Streaming is not yet supported/,
			);
		});

		it("throws when ANTHROPIC_API_KEY is missing", async () => {
			delete process.env.ANTHROPIC_API_KEY;
			const llm = new AnthropicLlm();
			const generator = llm["generateContentAsyncImpl"](mockLlmRequest);
			await expect(generator.next()).rejects.toThrow(/ANTHROPIC_API_KEY/);
			process.env.ANTHROPIC_API_KEY = mockApiKey;
		});

		it("uses MAX_TOKENS default when maxOutputTokens is omitted", async () => {
			const request = {
				...mockLlmRequest,
				config: {
					temperature: 0.2,
				},
			};
			const generator = anthropicLlm["generateContentAsyncImpl"](
				request as LlmRequest,
			);
			await generator.next();
			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					max_tokens: 1024,
					temperature: 0.2,
				}),
			);
		});

		it("omits tools and tool_choice when no functionDeclarations and forwards top_p", async () => {
			const generator =
				anthropicLlm["generateContentAsyncImpl"](mockLlmRequest);
			await generator.next();

			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					tools: undefined,
					tool_choice: undefined,
					temperature: 0.7,
					top_p: 0.9,
					max_tokens: 500,
				}),
			);
		});

		it("remaps messages when content is already an array of blocks", async () => {
			const request = {
				...mockLlmRequest,
				contents: [
					{
						role: "user",
						parts: [{ text: "first" }, { text: "second" }],
					},
				],
			};
			const generator = anthropicLlm["generateContentAsyncImpl"](
				request as LlmRequest,
			);
			await generator.next();

			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: [
						{
							role: "user",
							content: [
								{ type: "text", text: "first" },
								{ type: "text", text: "second" },
							],
						},
					],
				}),
			);
		});

		it("handles empty contents and omitted config", async () => {
			const request = {
				contents: undefined,
				getSystemInstructionText: () => "",
			};
			const generator = anthropicLlm["generateContentAsyncImpl"](
				request as unknown as LlmRequest,
			);
			await generator.next();

			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: [],
					tools: undefined,
					tool_choice: undefined,
					max_tokens: 1024,
					temperature: undefined,
					top_p: undefined,
				}),
			);
		});

		it("maps multi-block Anthropic responses into mixed ADK parts", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [
					{ type: "text", text: "calling tool" },
					{
						type: "tool_use",
						id: "tu1",
						name: "lookup",
						input: { q: "adk" },
					},
				],
				usage: { input_tokens: 7, output_tokens: 11 },
				stop_reason: "tool_use",
			});

			const generator =
				anthropicLlm["generateContentAsyncImpl"](mockLlmRequest);
			const result = await generator.next();
			const response = result.value as LlmResponse;

			expect(response.content?.parts).toEqual([
				{ text: "calling tool" },
				{
					function_call: {
						id: "tu1",
						name: "lookup",
						args: { q: "adk" },
					},
				},
			]);
			expect(response.finishReason).toBe("STOP");
			expect(response.usageMetadata).toEqual({
				promptTokenCount: 7,
				candidatesTokenCount: 11,
				totalTokenCount: 18,
			});
		});

		it("asserts full response shape from generateContentAsyncImpl", async () => {
			const generator =
				anthropicLlm["generateContentAsyncImpl"](mockLlmRequest);
			const result = await generator.next();
			const response = result.value as LlmResponse;

			expect(response).toBeInstanceOf(LlmResponse);
			expect(response.content).toEqual({
				role: "model",
				parts: [{ text: "Hello there!" }],
			});
			expect(response.finishReason).toBe("STOP");
			expect(response.usageMetadata).toEqual({
				promptTokenCount: 10,
				candidatesTokenCount: 20,
				totalTokenCount: 30,
			});
		});

		it("caches Anthropic client after first create", async () => {
			const generator1 =
				anthropicLlm["generateContentAsyncImpl"](mockLlmRequest);
			await generator1.next();
			const generator2 =
				anthropicLlm["generateContentAsyncImpl"](mockLlmRequest);
			await generator2.next();

			expect(Anthropic).toHaveBeenCalledTimes(1);
			expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
		});

		it("defaults empty parts to empty Anthropic message content", async () => {
			const request = {
				...mockLlmRequest,
				contents: [{ role: "user" }],
			};
			const generator = anthropicLlm["generateContentAsyncImpl"](
				request as LlmRequest,
			);
			await generator.next();

			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: [{ role: "user", content: [] }],
				}),
			);
		});

		it("maps max_tokens stop_reason to MAX_TOKENS finishReason", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [{ type: "text", text: "truncated" }],
				usage: { input_tokens: 3, output_tokens: 4 },
				stop_reason: "max_tokens",
			});

			const generator =
				anthropicLlm["generateContentAsyncImpl"](mockLlmRequest);
			const result = await generator.next();
			const response = result.value as LlmResponse;

			expect(response.finishReason).toBe("MAX_TOKENS");
			expect(response.usageMetadata?.totalTokenCount).toBe(7);
			expect(response.content?.parts).toEqual([{ text: "truncated" }]);
		});
	});

	describe("connect", () => {
		it("should throw error as live connection is not supported", () => {
			expect(() => anthropicLlm.connect({} as LlmRequest)).toThrow(
				"Live connection is not supported for claude-3-5-sonnet-20241022.",
			);
		});
	});

	describe("content conversion methods", () => {
		describe("anthropicMessageToLlmResponse", () => {
			it("should convert Anthropic message to LlmResponse", () => {
				const message = {
					content: [{ type: "text", text: "Hello" }],
					usage: {
						input_tokens: 5,
						output_tokens: 10,
					},
					stop_reason: "end_turn",
				};

				const response = anthropicLlm["anthropicMessageToLlmResponse"](
					message as any,
				);

				expect(response).toBeInstanceOf(LlmResponse);
				expect(response.content.parts).toEqual([{ text: "Hello" }]);
				expect(response.usageMetadata).toEqual({
					promptTokenCount: 5,
					candidatesTokenCount: 10,
					totalTokenCount: 15,
				});
				expect(response.finishReason).toBe("STOP");
			});
		});

		describe("contentToAnthropicMessage", () => {
			it("should convert content to Anthropic message", () => {
				const content = {
					role: "user",
					parts: [{ text: "Hi" }],
				};

				const message = anthropicLlm["contentToAnthropicMessage"](content);

				expect(message).toEqual({
					role: "user",
					content: [{ type: "text", text: "Hi" }],
				});
			});

			it("maps role model to assistant", () => {
				const message = anthropicLlm["contentToAnthropicMessage"]({
					role: "model",
					parts: [{ text: "assistant reply" }],
				});
				expect(message).toEqual({
					role: "assistant",
					content: [{ type: "text", text: "assistant reply" }],
				});
			});
		});

		describe("partToAnthropicBlock", () => {
			it("should convert text part to Anthropic block", () => {
				const part = { text: "Hello" };
				const block = anthropicLlm["partToAnthropicBlock"](part);
				expect(block).toEqual({ type: "text", text: "Hello" });
			});

			it("should convert function call part to Anthropic block", () => {
				const part = {
					function_call: {
						id: "123",
						name: "test_func",
						args: { param1: "value1" },
					},
				};
				const block = anthropicLlm["partToAnthropicBlock"](part);
				expect(block).toEqual({
					type: "tool_use",
					id: "123",
					name: "test_func",
					input: { param1: "value1" },
				});
			});

			it("should convert function response part to Anthropic block", () => {
				const part = {
					function_response: {
						id: "123",
						response: { result: "success" },
					},
				};
				const block = anthropicLlm["partToAnthropicBlock"](part);
				expect(block).toEqual({
					type: "tool_result",
					tool_use_id: "123",
					content: "success",
					is_error: false,
				});
			});

			it("uses empty tool_result content when response.result is absent", () => {
				const part = {
					function_response: {
						id: "abc",
						response: { ok: true },
					},
				};
				const block = anthropicLlm["partToAnthropicBlock"](part);
				expect(block).toEqual({
					type: "tool_result",
					tool_use_id: "abc",
					content: "",
					is_error: false,
				});
			});

			it("defaults missing function_response id and stringifies numeric result", () => {
				const block = anthropicLlm["partToAnthropicBlock"]({
					function_response: {
						response: { result: 42 },
					},
				});
				expect(block).toEqual({
					type: "tool_result",
					tool_use_id: "",
					content: "42",
					is_error: false,
				});
			});

			it("stringifies object function_response results", () => {
				const block = anthropicLlm["partToAnthropicBlock"]({
					function_response: {
						id: "obj-id",
						response: { result: { nested: true } },
					},
				});
				expect(block).toEqual({
					type: "tool_result",
					tool_use_id: "obj-id",
					content: String({ nested: true }),
					is_error: false,
				});
			});

			it("defaults missing function_call id and args", () => {
				const block = anthropicLlm["partToAnthropicBlock"]({
					function_call: { name: "noop" },
				});
				expect(block).toEqual({
					type: "tool_use",
					id: "",
					name: "noop",
					input: {},
				});
			});

			it("should throw error for unsupported part type", () => {
				expect(() =>
					anthropicLlm["partToAnthropicBlock"]({ unsupported: true } as any),
				).toThrow("Unsupported part type for Anthropic conversion");
			});
		});

		describe("anthropicBlockToPart", () => {
			it("should convert text block to part", () => {
				const block = { type: "text", text: "Hello" };
				const part = anthropicLlm["anthropicBlockToPart"](block);
				expect(part).toEqual({ text: "Hello" });
			});

			it("should convert tool_use block to part", () => {
				const block = {
					type: "tool_use",
					id: "123",
					name: "test_func",
					input: { param1: "value1" },
				};
				const part = anthropicLlm["anthropicBlockToPart"](block);
				expect(part).toEqual({
					function_call: {
						id: "123",
						name: "test_func",
						args: { param1: "value1" },
					},
				});
			});

			it("should throw error for unsupported block type", () => {
				expect(() =>
					anthropicLlm["anthropicBlockToPart"]({ type: "unsupported" } as any),
				).toThrow("Unsupported Anthropic content block type");
			});
		});

		describe("functionDeclarationToAnthropicTool", () => {
			it("should convert function declaration to Anthropic tool", () => {
				const funcDecl = {
					name: "test_func",
					description: "Test function",
					parameters: {
						properties: {
							param1: { type: "STRING" },
							param2: { type: "NUMBER" },
						},
					},
				};

				const tool =
					anthropicLlm["functionDeclarationToAnthropicTool"](funcDecl);

				expect(tool).toEqual({
					name: "test_func",
					description: "Test function",
					input_schema: {
						type: "object",
						properties: {
							param1: { type: "string" },
							param2: { type: "number" },
						},
					},
				});
			});

			it("defaults missing description and empty properties without parameters", () => {
				const tool = anthropicLlm["functionDeclarationToAnthropicTool"]({
					name: "bare",
				});
				expect(tool).toEqual({
					name: "bare",
					description: "",
					input_schema: {
						type: "object",
						properties: {},
					},
				});
			});

			it("lowercases nested items.properties via updateTypeString", () => {
				const tool = anthropicLlm["functionDeclarationToAnthropicTool"]({
					name: "nested",
					description: "Nested schema",
					parameters: {
						properties: {
							rows: {
								type: "ARRAY",
								items: {
									type: "OBJECT",
									properties: {
										id: { type: "STRING" },
										score: { type: "NUMBER" },
									},
								},
							},
						},
					},
				});

				expect(tool.input_schema.properties.rows).toEqual({
					type: "array",
					items: {
						type: "object",
						properties: {
							id: { type: "string" },
							score: { type: "number" },
						},
					},
				});
			});
		});

		describe("toAnthropicRole", () => {
			it.each([
				["model", "assistant"],
				["assistant", "assistant"],
				["user", "user"],
				["unknown", "user"],
				[undefined, "user"],
			])("should convert '%s' role to '%s'", (input, expected) => {
				expect(anthropicLlm["toAnthropicRole"](input)).toBe(expected);
			});
		});

		describe("toAdkFinishReason", () => {
			it.each([
				["end_turn", "STOP"],
				["stop_sequence", "STOP"],
				["tool_use", "STOP"],
				["max_tokens", "MAX_TOKENS"],
				["unknown", "FINISH_REASON_UNSPECIFIED"],
				[undefined, "FINISH_REASON_UNSPECIFIED"],
			])("should convert '%s' to '%s'", (input, expected) => {
				expect(anthropicLlm["toAdkFinishReason"](input)).toBe(expected);
			});
		});

		describe("updateTypeString", () => {
			it("should lowercase type strings in schema", () => {
				const schema = {
					type: "STRING",
					items: {
						type: "OBJECT",
						properties: {
							nested: { type: "NUMBER" },
						},
					},
				};

				anthropicLlm["updateTypeString"](schema);

				expect(schema.type).toBe("string");
				expect(schema.items.type).toBe("object");
				expect(schema.items.properties.nested.type).toBe("number");
			});

			it("leaves objects without type unchanged", () => {
				const schema = { description: "no type" };
				anthropicLlm["updateTypeString"](schema);
				expect(schema).toEqual({ description: "no type" });
			});

			it("handles schemas with type but without items", () => {
				const schema = { type: "BOOLEAN" };
				anthropicLlm["updateTypeString"](schema);
				expect(schema.type).toBe("boolean");
			});
		});
	});
});
