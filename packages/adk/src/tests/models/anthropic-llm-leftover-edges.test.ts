import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@anthropic-ai/sdk");

describe("AnthropicLlm leftover edges (overnight TOKENMAXX post #142)", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let mockMessagesCreate: ReturnType<typeof vi.fn>;
	let llm: AnthropicLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		mockMessagesCreate = vi.fn();
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create: mockMessagesCreate },
			}),
		);
		llm = new AnthropicLlm();
		vi.clearAllMocks();
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create: mockMessagesCreate },
			}),
		);
	});

	afterEach(() => {
		process.env = originalEnv;
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
		mockMessagesCreate.mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});

		await drain(
			(llm as any).generateContentAsyncImpl(
				baseRequest({
					config: { tools: [{ functionDeclarations: [] }] },
				}),
				false,
			),
		);

		expect(mockMessagesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: [],
				tool_choice: { type: "auto" },
			}),
		);
	});

	it("undefined config uses MAX_TOKENS 1024 and omits temperature/top_p", async () => {
		mockMessagesCreate.mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});

		const req = baseRequest();
		delete (req as { config?: unknown }).config;

		await drain((llm as any).generateContentAsyncImpl(req, false));

		expect(mockMessagesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				max_tokens: 1024,
				temperature: undefined,
				top_p: undefined,
				tools: undefined,
				tool_choice: undefined,
			}),
		);
	});

	it("empty tools array omits tools and tool_choice", async () => {
		mockMessagesCreate.mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});

		await drain(
			(llm as any).generateContentAsyncImpl(
				baseRequest({ config: { tools: [] } }),
				false,
			),
		);

		expect(mockMessagesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: undefined,
				tool_choice: undefined,
			}),
		);
	});

	it.each([
		{ label: "false", result: false },
		{ label: "0", result: 0 },
		{ label: "empty string", result: "" },
	])("function_response result $label yields empty tool_result content", ({
		result,
	}) => {
		const block = (llm as any).partToAnthropicBlock({
			function_response: {
				id: "tr-1",
				response: { result },
			},
		});
		expect(block).toEqual({
			type: "tool_result",
			tool_use_id: "tr-1",
			content: "",
			is_error: false,
		});
	});

	it("part with both text and function_call prefers text block", () => {
		const block = (llm as any).partToAnthropicBlock({
			text: "prefer me",
			function_call: { id: "c1", name: "fn", args: { a: 1 } },
		});
		expect(block).toEqual({ type: "text", text: "prefer me" });
	});

	it("generateContentAsyncImpl remaps array blocks and throws on prior tool_use shapes", async () => {
		const req = baseRequest({
			contents: [
				{
					role: "assistant",
					parts: [
						{
							function_call: {
								id: "call-1",
								name: "lookup",
								args: { q: "x" },
							},
						},
					],
				},
			],
		});

		await expect(
			drain((llm as any).generateContentAsyncImpl(req, false)),
		).rejects.toThrow(/Unsupported part type for Anthropic conversion/);
		expect(mockMessagesCreate).not.toHaveBeenCalled();
	});

	it.each([
		{ stop_reason: "max_tokens", expected: "MAX_TOKENS" },
		{ stop_reason: "stop_sequence", expected: "STOP" },
		{ stop_reason: "tool_use", expected: "STOP" },
		{ stop_reason: "mystery", expected: "FINISH_REASON_UNSPECIFIED" },
	])("end-to-end stop_reason $stop_reason maps finishReason to $expected", async ({
		stop_reason,
		expected,
	}) => {
		mockMessagesCreate.mockResolvedValue({
			content: [{ type: "text", text: "done" }],
			usage: { input_tokens: 2, output_tokens: 3 },
			stop_reason,
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), false),
		);

		expect(responses).toHaveLength(1);
		expect(responses[0].finishReason).toBe(expected);
		expect(responses[0].usageMetadata).toEqual({
			promptTokenCount: 2,
			candidatesTokenCount: 3,
			totalTokenCount: 5,
		});
	});

	it("updateTypeString is a no-op on empty object", () => {
		const value: Record<string, unknown> = {};
		(llm as any).updateTypeString(value);
		expect(value).toEqual({});
	});

	it("functionDeclarationToAnthropicTool recurses items.properties via generate path", async () => {
		mockMessagesCreate.mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});

		await drain(
			(llm as any).generateContentAsyncImpl(
				baseRequest({
					config: {
						tools: [
							{
								functionDeclarations: [
									{
										name: "nested_tool",
										description: "nested",
										parameters: {
											type: "OBJECT",
											properties: {
												rows: {
													type: "ARRAY",
													items: {
														type: "OBJECT",
														properties: {
															label: { type: "STRING" },
														},
													},
												},
											},
										},
									},
								],
							},
						],
					},
				}),
				false,
			),
		);

		expect(mockMessagesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: [
					{
						name: "nested_tool",
						description: "nested",
						input_schema: {
							type: "object",
							properties: {
								rows: {
									type: "array",
									items: {
										type: "object",
										properties: {
											label: { type: "string" },
										},
									},
								},
							},
						},
					},
				],
			}),
		);
	});

	it("client getter throws before Anthropic construct when key missing on fresh instance", async () => {
		delete process.env.ANTHROPIC_API_KEY;
		const fresh = new AnthropicLlm("claude-3-5-sonnet-20241022");
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockClear();

		await expect(
			drain((fresh as any).generateContentAsyncImpl(baseRequest(), false)),
		).rejects.toThrow(/ANTHROPIC_API_KEY/);
		expect(Anthropic).not.toHaveBeenCalled();
	});

	it("connect interpolates the instance model name", () => {
		const named = new AnthropicLlm("claude-opus-custom");
		expect(() => named.connect(baseRequest())).toThrow(
			/Live connection is not supported for claude-opus-custom/,
		);
	});

	it("toAnthropicRole maps unknown and undefined roles to user", () => {
		expect((llm as any).toAnthropicRole(undefined)).toBe("user");
		expect((llm as any).toAnthropicRole("tool")).toBe("user");
		expect((llm as any).toAnthropicRole("system")).toBe("user");
	});
});
