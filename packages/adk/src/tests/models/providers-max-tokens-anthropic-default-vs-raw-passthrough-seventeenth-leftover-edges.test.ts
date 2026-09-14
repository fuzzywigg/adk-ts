import type { LanguageModel } from "ai";
import Anthropic from "@anthropic-ai/sdk";
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

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: { completions: { create: vi.fn() } },
	})),
}));

vi.mock("@anthropic-ai/sdk", () => ({
	default: vi.fn(() => ({
		messages: { create: vi.fn() },
	})),
}));

const { generateText } = vi.hoisted(() => ({
	generateText: vi.fn(),
}));

vi.mock("ai", () => ({
	generateText,
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

/**
 * Seventeenth leftover: Anthropic `max_tokens || 1024` vs OpenAI/AI SDK raw
 * passthrough of falsy maxOutputTokens. Fourteenth is Anthropic-only; this is
 * the three-way residual asymmetry.
 */
describe("providers max-tokens anthropic default vs raw passthrough seventeenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let openaiCreate: ReturnType<typeof vi.fn>;
	let anthropicCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		process.env.ANTHROPIC_API_KEY = "test-key";
		vi.clearAllMocks();
		openaiCreate = vi.fn().mockResolvedValue({
			choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
		});
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create: openaiCreate } },
		}));
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
		generateText.mockResolvedValue({
			text: "ok",
			toolCalls: [],
			usage: undefined,
			finishReason: "stop",
		});
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "empty", value: "" },
		{ label: "null", value: null },
	])("falsy maxOutputTokens ($label): Anthropic 1024; OpenAI/AI SDK raw", async ({
		value,
	}) => {
		const req = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "q" }] }],
			config: { maxOutputTokens: value as any },
		});

		for await (const _ of (
			new OpenAiLlm("gpt-4o-mini") as any
		).generateContentAsyncImpl(req, false)) {
			/* drain */
		}
		expect(openaiCreate.mock.calls[0][0].max_tokens).toBe(value);

		for await (const _ of (new AnthropicLlm() as any).generateContentAsyncImpl(
			req,
			false,
		)) {
			/* drain */
		}
		expect(anthropicCreate.mock.calls[0][0].max_tokens).toBe(1024);

		const ai = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
		for await (const _ of (ai as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}
		expect(generateText.mock.calls[0][0].maxTokens).toBe(value);
	});

	it('truthy "0" forwarded on all three', async () => {
		const req = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "q" }] }],
			config: { maxOutputTokens: "0" as any },
		});

		for await (const _ of (
			new OpenAiLlm("gpt-4o-mini") as any
		).generateContentAsyncImpl(req, false)) {
			/* drain */
		}
		expect(openaiCreate.mock.calls[0][0].max_tokens).toBe("0");

		for await (const _ of (new AnthropicLlm() as any).generateContentAsyncImpl(
			req,
			false,
		)) {
			/* drain */
		}
		expect(anthropicCreate.mock.calls[0][0].max_tokens).toBe("0");

		const ai = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
		for await (const _ of (ai as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}
		expect(generateText.mock.calls[0][0].maxTokens).toBe("0");
	});
});
