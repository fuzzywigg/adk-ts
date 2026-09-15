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
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #261; lands closed #252):
 * `llmRequest.model || this.model` across providers. Fourteenth pinned
 * whitespace/`"0"` keep and classic falsy fallback. Residual boolean `true` /
 * `"true"` / `[]` / `-Infinity` keep; SameValueZero `-0` falls back.
 */
describe("providers model boolean-true/string-true/negzero nineteenth leftover edges", () => {
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
		{ label: "boolean true", model: true as any, expected: true },
		{ label: "string true", model: "true", expected: "true" },
		{ label: "empty array", model: [] as any, expected: [] },
		{
			label: "NEGATIVE_INFINITY",
			model: Number.NEGATIVE_INFINITY as any,
			expected: Number.NEGATIVE_INFINITY,
		},
	])("OpenAI keeps truthy near-miss request model ($label)", async ({
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

	it("OpenAI falls back on SameValueZero -0 request model", async () => {
		const llm = new OpenAiLlm("gpt-4o-mini");
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				model: -0 as any,
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
		{ label: "boolean true", model: true as any, expected: true },
		{ label: "string true", model: "true", expected: "true" },
		{ label: "-0", model: -0 as any, expected: "claude-ctor" },
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
		{ label: "boolean true", model: true as any, expected: true },
		{ label: "string true", model: "true", expected: "true" },
		{ label: "-0", model: -0 as any, expected: "gemini-ctor" },
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
