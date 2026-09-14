import Anthropic from "@anthropic-ai/sdk";
import type { LanguageModel } from "ai";
import { generateText } from "ai";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
import { AnthropicLlm } from "../../models/anthropic-llm";
import { LlmRequest } from "../../models/llm-request";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@anthropic-ai/sdk");

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: { completions: { create: vi.fn() } },
	})),
}));

vi.mock("ai", () => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip 96457a9 / #248):
 * Anthropic `max_tokens || 1024` vs OpenAI/AI SDK passthrough after eighteenth
 * true/`"true"`/`[]`/`-Infinity`/`-0`. `NaN` → Anthropic 1024 only;
 * `POSITIVE_INFINITY` forwarded by all three.
 */
describe("providers max-tokens nan posinf nineteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let anthropicCreate: ReturnType<typeof vi.fn>;
	let openaiCreate: ReturnType<typeof vi.fn>;
	let anthropic: AnthropicLlm;
	let openai: OpenAiLlm;
	let aiSdk: AiSdkLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		process.env.OPENAI_API_KEY = "test-key";
		anthropicCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create: anthropicCreate },
			}),
		);
		openaiCreate = vi.fn().mockResolvedValue({
			choices: [
				{
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				},
			],
		});
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create: openaiCreate } },
		}));
		(generateText as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
			text: "ok",
			usage: { promptTokens: 1, completionTokens: 1 },
			finishReason: "stop",
			toolCalls: [],
		});
		anthropic = new AnthropicLlm();
		openai = new OpenAiLlm();
		aiSdk = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	async function drainAnthropic(maxOutputTokens: any) {
		for await (const _ of (anthropic as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { maxOutputTokens },
			}),
			false,
		)) {
			/* drain */
		}
	}

	async function drainOpenAi(maxOutputTokens: any) {
		for await (const _ of (openai as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { maxOutputTokens },
			}),
			false,
		)) {
			/* drain */
		}
	}

	async function drainAiSdk(maxOutputTokens: any) {
		for await (const _ of (aiSdk as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { maxOutputTokens },
			}),
			false,
		)) {
			/* drain */
		}
	}

	it("NaN → Anthropic 1024; OpenAI/AI SDK keep NaN passthrough", async () => {
		await drainAnthropic(Number.NaN);
		expect(anthropicCreate).toHaveBeenCalledWith(
			expect.objectContaining({ max_tokens: 1024 }),
		);

		await drainOpenAi(Number.NaN);
		const openaiArg = openaiCreate.mock.calls.at(-1)?.[0];
		expect(Number.isNaN(openaiArg.max_tokens)).toBe(true);

		await drainAiSdk(Number.NaN);
		const aiArg = (
			generateText as unknown as ReturnType<typeof vi.fn>
		).mock.calls.at(-1)?.[0];
		expect(Number.isNaN(aiArg.maxTokens)).toBe(true);
	});

	it("POSITIVE_INFINITY forwarded by all three providers", async () => {
		await drainAnthropic(Number.POSITIVE_INFINITY);
		expect(anthropicCreate).toHaveBeenCalledWith(
			expect.objectContaining({ max_tokens: Number.POSITIVE_INFINITY }),
		);

		await drainOpenAi(Number.POSITIVE_INFINITY);
		expect(openaiCreate).toHaveBeenCalledWith(
			expect.objectContaining({ max_tokens: Number.POSITIVE_INFINITY }),
		);

		await drainAiSdk(Number.POSITIVE_INFINITY);
		expect(generateText).toHaveBeenCalledWith(
			expect.objectContaining({ maxTokens: Number.POSITIVE_INFINITY }),
		);
	});
});
