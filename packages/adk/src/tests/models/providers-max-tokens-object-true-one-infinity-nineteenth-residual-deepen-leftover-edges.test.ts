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
 * Nineteenth leftover residual deepen (complements #269 NaN/posinf max_tokens):
 * Anthropic `max_tokens || 1024` vs OpenAI/AI SDK passthrough —
 * `Object(true)` / `1` / `"Infinity"` / `{}` forwarded by all three.
 */
describe("providers max-tokens object-true/one/infinity nineteenth residual deepen", () => {
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

	it.each([
		{ label: "Object(true)", value: Object(true) },
		{ label: "number 1", value: 1 },
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "empty object", value: {} },
	])("$label forwarded by all three providers", async ({ value }) => {
		await drainAnthropic(value);
		expect(anthropicCreate).toHaveBeenCalledWith(
			expect.objectContaining({ max_tokens: value }),
		);

		await drainOpenAi(value);
		expect(openaiCreate).toHaveBeenCalledWith(
			expect.objectContaining({ max_tokens: value }),
		);

		await drainAiSdk(value);
		expect(generateText).toHaveBeenCalledWith(
			expect.objectContaining({ maxTokens: value }),
		);
	});
});
