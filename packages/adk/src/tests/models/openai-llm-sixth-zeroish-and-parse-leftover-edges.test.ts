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

describe("OpenAiLlm sixth leftover: zeroish config + parse throws (post #151)", () => {
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
		llm = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	async function drain(
		req: LlmRequest,
		stream = false,
	): Promise<LlmResponse[]> {
		const out: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			req,
			stream,
		)) {
			out.push(response);
		}
		return out;
	}

	it.each([
		{
			label: "temperature 0",
			config: { temperature: 0 },
			expectKey: "temperature",
			expectVal: 0,
		},
		{
			label: "topP 0",
			config: { topP: 0 },
			expectKey: "top_p",
			expectVal: 0,
		},
		{
			label: "maxOutputTokens 0",
			config: { maxOutputTokens: 0 },
			expectKey: "max_tokens",
			expectVal: 0,
		},
	])("forwards literal $label into request params (not coerced away)", async ({
		config,
		expectKey,
		expectVal,
	}) => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				},
			],
		});

		await drain(
			new LlmRequest({
				model: "gpt-4o",
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: config as any,
			}),
		);

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				[expectKey]: expectVal,
			}),
		);
	});

	it("forwards all three zeroish params together", async () => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				},
			],
		});

		await drain(
			new LlmRequest({
				model: "gpt-4o",
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: {
					temperature: 0,
					topP: 0,
					maxOutputTokens: 0,
				} as any,
			}),
		);

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				temperature: 0,
				top_p: 0,
				max_tokens: 0,
			}),
		);
	});

	it("non-stream openAiMessageToLlmResponse throws on malformed tool arguments", async () => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: {
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "bad-1",
								type: "function",
								function: {
									name: "broken",
									arguments: "{not-json",
								},
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
		});

		await expect(
			drain(
				new LlmRequest({
					model: "gpt-4o",
					contents: [{ role: "user", parts: [{ text: "q" }] }],
				}),
			),
		).rejects.toThrow();
	});

	it("stream finish throws when accumulated tool arguments are malformed JSON", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "stream-bad",
										type: "function",
										function: {
											name: "broken_stream",
											arguments: '{"a":',
										},
									},
								],
							},
							finish_reason: null,
						},
					],
				};
				yield {
					choices: [{ delta: {}, finish_reason: "tool_calls" }],
				};
			})(),
		);

		await expect(
			drain(
				new LlmRequest({
					model: "gpt-4o",
					contents: [{ role: "user", parts: [{ text: "q" }] }],
				}),
				true,
			),
		).rejects.toThrow();
	});

	it("createChunkResponse throws when delta tool_calls arguments are malformed", () => {
		expect(() =>
			(llm as any).createChunkResponse({
				tool_calls: [
					{
						id: "chunk-bad",
						type: "function",
						function: { name: "chunk_tool", arguments: "not-json" },
					},
				],
			}),
		).toThrow();
	});
});
