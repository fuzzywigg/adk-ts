import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";
import type { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";

vi.mock("@anthropic-ai/sdk");
vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

describe("AnthropicLlm heavy matrix leftover edges (post #144)", () => {
	let llm: AnthropicLlm;
	let mockMessagesCreate: ReturnType<typeof vi.fn>;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "fake-anthropic-key";
		mockMessagesCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});
		(Anthropic as any).mockImplementation(() => ({
			messages: { create: mockMessagesCreate },
		}));
		llm = new AnthropicLlm();
		vi.clearAllMocks();
		(Anthropic as any).mockImplementation(() => ({
			messages: { create: mockMessagesCreate },
		}));
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	function baseRequest(overrides: Record<string, unknown> = {}): LlmRequest {
		return {
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
			config: {},
			getSystemInstructionText: () => "",
			...overrides,
		} as unknown as LlmRequest;
	}

	describe("toAdkFinishReason matrix", () => {
		it.each([
			["end_turn", "STOP"],
			["stop_sequence", "STOP"],
			["tool_use", "STOP"],
			["max_tokens", "MAX_TOKENS"],
			["unknown", "FINISH_REASON_UNSPECIFIED"],
			["", "FINISH_REASON_UNSPECIFIED"],
			[undefined, "FINISH_REASON_UNSPECIFIED"],
			["END_TURN", "FINISH_REASON_UNSPECIFIED"],
		])("%s => %s", (input, expected) => {
			expect((llm as any).toAdkFinishReason(input)).toBe(expected);
		});
	});

	describe("toAnthropicRole matrix", () => {
		it.each([
			["model", "assistant"],
			["assistant", "assistant"],
			["user", "user"],
			["system", "user"],
			["tool", "user"],
			[undefined, "user"],
			["", "user"],
		])("%s => %s", (input, expected) => {
			expect((llm as any).toAnthropicRole(input)).toBe(expected);
		});
	});

	describe("partToAnthropicBlock matrix", () => {
		it.each([
			{
				label: "text",
				part: { text: "hello" },
				expected: { type: "text", text: "hello" },
			},
			{
				label: "function_call defaults",
				part: { function_call: { name: "fn" } },
				expected: {
					type: "tool_use",
					id: "",
					name: "fn",
					input: {},
				},
			},
			{
				label: "function_call full",
				part: {
					function_call: { id: "c1", name: "fn", args: { q: 1 } },
				},
				expected: {
					type: "tool_use",
					id: "c1",
					name: "fn",
					input: { q: 1 },
				},
			},
			{
				label: "function_response missing result",
				part: { function_response: { id: "r1", response: {} } },
				expected: {
					type: "tool_result",
					tool_use_id: "r1",
					content: "",
					is_error: false,
				},
			},
			{
				label: "function_response missing id stringifies result",
				part: {
					function_response: { response: { result: { nested: true } } },
				},
				expected: {
					type: "tool_result",
					tool_use_id: "",
					content: "[object Object]",
					is_error: false,
				},
			},
			{
				label: "function_response number result",
				part: {
					function_response: { id: "r2", response: { result: 7 } },
				},
				expected: {
					type: "tool_result",
					tool_use_id: "r2",
					content: "7",
					is_error: false,
				},
			},
		])("$label", ({ part, expected }) => {
			expect((llm as any).partToAnthropicBlock(part)).toEqual(expected);
		});

		it("throws for unsupported part shapes", () => {
			expect(() =>
				(llm as any).partToAnthropicBlock({ inlineData: { data: "x" } }),
			).toThrow(/Unsupported part type/);
		});
	});

	describe("anthropicBlockToPart matrix", () => {
		it.each([
			{
				label: "text",
				block: { type: "text", text: "hi" },
				expected: { text: "hi" },
			},
			{
				label: "tool_use",
				block: { type: "tool_use", id: "t1", name: "go", input: { a: 1 } },
				expected: {
					function_call: { id: "t1", name: "go", args: { a: 1 } },
				},
			},
		])("$label", ({ block, expected }) => {
			expect((llm as any).anthropicBlockToPart(block)).toEqual(expected);
		});

		it.each([
			{ type: "tool_result" },
			{ type: "image" },
			{ type: undefined },
		])("throws for unsupported block $type", (block) => {
			expect(() => (llm as any).anthropicBlockToPart(block)).toThrow(
				/Unsupported Anthropic content block type/,
			);
		});
	});

	describe("updateTypeString / functionDeclaration matrix", () => {
		it("recurses items.properties depth", () => {
			const schema = {
				type: "ARRAY",
				items: {
					type: "OBJECT",
					properties: {
						child: {
							type: "ARRAY",
							items: {
								type: "STRING",
								properties: {
									ignoredOnString: { type: "BOOLEAN" },
								},
							},
						},
					},
				},
			};
			(llm as any).updateTypeString(schema);
			expect(schema.type).toBe("array");
			expect(schema.items.type).toBe("object");
			expect(schema.items.properties.child.type).toBe("array");
			expect(schema.items.properties.child.items.type).toBe("string");
			expect(
				schema.items.properties.child.items.properties.ignoredOnString.type,
			).toBe("boolean");
		});

		it.each([
			{
				label: "bare declaration",
				decl: { name: "bare" },
				expected: {
					name: "bare",
					description: "",
					input_schema: { type: "object", properties: {} },
				},
			},
			{
				label: "parameters without properties",
				decl: {
					name: "no-props",
					description: "d",
					parameters: { type: "OBJECT" },
				},
				expected: {
					name: "no-props",
					description: "d",
					input_schema: { type: "object", properties: {} },
				},
			},
			{
				label: "properties lowercased",
				decl: {
					name: "typed",
					description: "desc",
					parameters: {
						type: "OBJECT",
						properties: {
							q: { type: "STRING" },
							n: { type: "NUMBER" },
						},
					},
				},
				expected: {
					name: "typed",
					description: "desc",
					input_schema: {
						type: "object",
						properties: {
							q: { type: "string" },
							n: { type: "number" },
						},
					},
				},
			},
		])("functionDeclarationToAnthropicTool $label", ({ decl, expected }) => {
			expect((llm as any).functionDeclarationToAnthropicTool(decl)).toEqual(
				expected,
			);
		});
	});

	describe("generateContentAsyncImpl request wiring matrix", () => {
		it.each([
			{
				label: "default max tokens",
				config: {},
				expected: {
					max_tokens: 1024,
					tool_choice: undefined,
					tools: undefined,
				},
			},
			{
				label: "custom max tokens and sampling",
				config: { maxOutputTokens: 50, temperature: 0.1, topP: 0.2 },
				expected: {
					max_tokens: 50,
					temperature: 0.1,
					top_p: 0.2,
					tool_choice: undefined,
					tools: undefined,
				},
			},
		])("$label", async ({ config, expected }) => {
			await (llm as any)
				.generateContentAsyncImpl(baseRequest({ config }))
				.next();
			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining(expected),
			);
		});

		it("wires tools only from tools[0].functionDeclarations", async () => {
			await (llm as any)
				.generateContentAsyncImpl(
					baseRequest({
						config: {
							tools: [
								{
									functionDeclarations: [{ name: "one", description: "first" }],
								},
								{
									functionDeclarations: [
										{ name: "two", description: "ignored" },
									],
								},
							],
						},
					}),
				)
				.next();

			const call = mockMessagesCreate.mock.calls[0][0];
			expect(call.tool_choice).toEqual({ type: "auto" });
			expect(call.tools).toHaveLength(1);
			expect(call.tools[0].name).toBe("one");
		});

		it.each([
			{
				label: "null contents",
				contents: null,
				expectedMessages: [],
				expectedModel: "claude-3-5-sonnet-20241022",
			},
			{
				label: "undefined contents",
				contents: undefined,
				expectedMessages: [],
				expectedModel: "claude-3-5-sonnet-20241022",
			},
			{
				label: "explicit model",
				contents: [{ role: "user", parts: [{ text: "x" }] }],
				expectedMessages: [
					{ role: "user", content: [{ type: "text", text: "x" }] },
				],
				expectedModel: "claude-3-opus",
				model: "claude-3-opus",
			},
		])("$label", async ({
			contents,
			expectedMessages,
			expectedModel,
			model,
		}) => {
			await (llm as any)
				.generateContentAsyncImpl(baseRequest({ contents, model }))
				.next();
			expect(mockMessagesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: expectedModel,
					messages: expectedMessages,
				}),
			);
		});

		it("throws when streaming is requested", async () => {
			await expect(
				(llm as any).generateContentAsyncImpl(baseRequest(), true).next(),
			).rejects.toThrow(/Streaming is not yet supported/);
		});

		it("yields mapped multi-block responses", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [
					{ type: "text", text: "calling" },
					{
						type: "tool_use",
						id: "tu1",
						name: "lookup",
						input: { q: "adk" },
					},
				],
				usage: { input_tokens: 2, output_tokens: 4 },
				stop_reason: "tool_use",
			});
			const result = await (llm as any)
				.generateContentAsyncImpl(baseRequest())
				.next();
			const response = result.value as LlmResponse;
			expect(response.finishReason).toBe("STOP");
			expect(response.usageMetadata?.totalTokenCount).toBe(6);
			expect(response.content?.parts).toEqual([
				{ text: "calling" },
				{
					function_call: {
						id: "tu1",
						name: "lookup",
						args: { q: "adk" },
					},
				},
			]);
		});
	});
});
