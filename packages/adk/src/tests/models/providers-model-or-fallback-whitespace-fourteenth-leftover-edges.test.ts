import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";
import { GoogleLlm } from "../../models/google-llm";
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

vi.mock("@google/genai", () => ({
	GoogleGenAI: vi.fn(),
	FinishReason: {
		STOP: "STOP",
		MAX_TOKENS: "MAX_TOKENS",
		FINISH_REASON_UNSPECIFIED: "FINISH_REASON_UNSPECIFIED",
	},
}));

/**
 * Fourteenth leftover: `llmRequest.model || this.model` across providers.
 * Matrices already pin undefined/null/""; whitespace is truthy and kept, while
 * 0 / false still fall back to the constructor model.
 */
describe("providers model || fallback whitespace fourteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let openaiCreate: ReturnType<typeof vi.fn>;
	let anthropicCreate: ReturnType<typeof vi.fn>;
	let googleGenerate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		process.env.ANTHROPIC_API_KEY = "test-key";
		process.env.GOOGLE_API_KEY = "test-key";
		delete process.env.GOOGLE_GENAI_USE_VERTEXAI;

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

		googleGenerate = vi.fn().mockResolvedValue({
			candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }],
		});
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: googleGenerate,
					generateContentStream: vi.fn(),
				},
			}),
		);
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		{ label: "whitespace", model: " ", expected: " " },
		{ label: "zero string", model: "0", expected: "0" },
	])("OpenAI keeps truthy request model ($label)", async ({
		model,
		expected,
	}) => {
		const llm = new OpenAiLlm("gpt-4o-mini");
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				model,
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			false,
		)) {
			/* drain */
		}
		expect(openaiCreate).toHaveBeenCalledWith(
			expect.objectContaining({ model: expected }),
		);
	});

	it.each([
		{ label: "0", model: 0 as any },
		{ label: "false", model: false as any },
	])("OpenAI falls back on falsy request model ($label)", async ({ model }) => {
		const llm = new OpenAiLlm("gpt-4o-mini");
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				model,
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			false,
		)) {
			/* drain */
		}
		expect(openaiCreate).toHaveBeenCalledWith(
			expect.objectContaining({ model: "gpt-4o-mini" }),
		);
	});

	it.each([
		{ label: "whitespace", model: " ", expected: " " },
		{ label: "empty", model: "", expected: "claude-ctor" },
		{ label: "0", model: 0 as any, expected: "claude-ctor" },
	])("Anthropic model || this.model ($label → $expected)", async ({
		model,
		expected,
	}) => {
		const llm = new AnthropicLlm("claude-ctor");
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				model,
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			false,
		)) {
			/* drain */
		}
		expect(anthropicCreate).toHaveBeenCalledWith(
			expect.objectContaining({ model: expected }),
		);
	});

	it.each([
		{ label: "whitespace", model: " ", expected: " " },
		{ label: "empty", model: "", expected: "gemini-ctor" },
		{ label: "false", model: false as any, expected: "gemini-ctor" },
	])("Google model || this.model ($label → $expected)", async ({
		model,
		expected,
	}) => {
		const llm = new GoogleLlm("gemini-ctor");
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				model,
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			false,
		)) {
			/* drain */
		}
		expect(googleGenerate).toHaveBeenCalledWith(
			expect.objectContaining({ model: expected }),
		);
	});
});
