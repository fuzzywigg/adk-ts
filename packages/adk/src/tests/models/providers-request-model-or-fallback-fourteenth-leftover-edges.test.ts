import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@anthropic-ai/sdk");

/**
 * Fourteenth leftover: `llmRequest.model || this.model` — empty string falls
 * back; whitespace / "0" stay truthy and are passed through.
 */
describe("providers request model || fallback fourteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let openAiCreate: ReturnType<typeof vi.fn>;
	let anthropicCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		process.env.ANTHROPIC_API_KEY = "test-key";
		openAiCreate = vi.fn().mockResolvedValue({
			choices: [
				{
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				},
			],
		});
		anthropicCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			stop_reason: "end_turn",
			usage: { input_tokens: 1, output_tokens: 1 },
		});
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create: openAiCreate } },
		}));
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create: anthropicCreate },
			}),
		);
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		{ label: "empty string", model: "", expected: "gpt-4o-mini" },
		{ label: "whitespace", model: " ", expected: " " },
		{ label: 'string "0"', model: "0", expected: "0" },
	])("OpenAI $label model → $expected", async ({ model, expected }) => {
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
		expect(openAiCreate.mock.calls[0][0].model).toBe(expected);
	});

	it.each([
		{
			label: "empty string",
			model: "",
			expected: "claude-3-5-sonnet-20241022",
		},
		{ label: "whitespace", model: " ", expected: " " },
		{ label: 'string "0"', model: "0", expected: "0" },
	])("Anthropic $label model → $expected", async ({ model, expected }) => {
		const llm = new AnthropicLlm();
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				model,
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			false,
		)) {
			/* drain */
		}
		expect(anthropicCreate.mock.calls[0][0].model).toBe(expected);
	});
});
