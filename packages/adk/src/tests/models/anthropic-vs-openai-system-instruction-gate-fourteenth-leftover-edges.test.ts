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
 * Fourteenth leftover: getSystemInstructionText treats "" as falsy → undefined.
 * Anthropic still always passes a `system` key (undefined); OpenAI omits the
 * system message. Whitespace stays truthy for both.
 */
describe("anthropic vs openai systemInstruction gate fourteenth leftover edges", () => {
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

	it("empty-string systemInstruction: Anthropic still has system key as undefined", async () => {
		const llm = new AnthropicLlm();
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { systemInstruction: "" },
			}),
			false,
		)) {
			/* drain */
		}
		const params = anthropicCreate.mock.calls[0][0];
		expect(Object.hasOwn(params, "system")).toBe(true);
		expect(params.system).toBeUndefined();
	});

	it("empty-string systemInstruction: OpenAI omits system message", async () => {
		const llm = new OpenAiLlm("gpt-4o-mini");
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { systemInstruction: "" },
			}),
			false,
		)) {
			/* drain */
		}
		const messages = openAiCreate.mock.calls[0][0].messages;
		expect(messages.some((m: { role: string }) => m.role === "system")).toBe(
			false,
		);
	});

	it("whitespace systemInstruction kept by both providers", async () => {
		const openAi = new OpenAiLlm("gpt-4o-mini");
		const anthropic = new AnthropicLlm();
		const req = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "q" }] }],
			config: { systemInstruction: " " },
		});
		for await (const _ of (openAi as any).generateContentAsyncImpl(
			req,
			false,
		)) {
			/* drain */
		}
		for await (const _ of (anthropic as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { systemInstruction: " " },
			}),
			false,
		)) {
			/* drain */
		}
		expect(openAiCreate.mock.calls[0][0].messages[0]).toEqual({
			role: "system",
			content: " ",
		});
		expect(anthropicCreate.mock.calls[0][0].system).toBe(" ");
	});
});
