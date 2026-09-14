import type { LanguageModel } from "ai";
import Anthropic from "@anthropic-ai/sdk";
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
 * Eighteenth leftover: Anthropic `max_tokens || 1024` vs OpenAI/AI SDK
 * passthrough residual after seventeenth. Boolean `true` / string `"true"` /
 * `[]` / `NEGATIVE_INFINITY` forward on all three; `-0` defaults on Anthropic
 * only (SameValueZero-falsy).
 */
describe("providers max-tokens boolean-true negzero infinity eighteenth leftover edges", () => {
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
		{ label: "boolean true", value: true },
		{ label: "string true", value: "true" },
		{ label: "empty array", value: [] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("truthy near-miss $label forwarded by all three providers", async ({
		value,
	}) => {
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

	it("-0 → Anthropic 1024; OpenAI/AI SDK keep signed-zero passthrough", async () => {
		await drainAnthropic(-0);
		expect(anthropicCreate).toHaveBeenCalledWith(
			expect.objectContaining({ max_tokens: 1024 }),
		);

		await drainOpenAi(-0);
		const openaiArg = openaiCreate.mock.calls.at(-1)?.[0];
		expect(Object.is(openaiArg.max_tokens, -0)).toBe(true);

		await drainAiSdk(-0);
		const aiArg = (
			generateText as unknown as ReturnType<typeof vi.fn>
		).mock.calls.at(-1)?.[0];
		expect(Object.is(aiArg.maxTokens, -0)).toBe(true);
	});
});
