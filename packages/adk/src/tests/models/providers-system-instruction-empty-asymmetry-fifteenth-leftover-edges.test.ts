import Anthropic from "@anthropic-ai/sdk";
import type { LanguageModel } from "ai";
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

const { generateText, streamText } = vi.hoisted(() => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
}));

vi.mock("ai", () => ({
	generateText,
	streamText,
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

/**
 * Fifteenth leftover: string `systemInstruction: ""` is falsy in
 * `getSystemInstructionText` → undefined for all providers. But a Content
 * object with empty/filtered parts is truthy at the gate and can return "",
 * which OpenAI then skips via `if (systemContent)` while Anthropic/AI SDK
 * still forward `system: ""`.
 */
describe("providers systemInstruction empty asymmetry fifteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let openaiCreate: ReturnType<typeof vi.fn>;
	let anthropicCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		process.env.ANTHROPIC_API_KEY = "test-key";

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
		vi.clearAllMocks();
	});

	const emptyContentInstruction = {
		role: "system",
		parts: [{ text: "" }],
	};

	it('Content systemInstruction with empty parts → getSystemInstructionText ""', () => {
		const req = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "q" }] }],
			config: { systemInstruction: emptyContentInstruction as any },
		});
		expect(req.getSystemInstructionText()).toBe("");
	});

	it("OpenAI skips unshifting system when Content extracts to empty string", async () => {
		const llm = new OpenAiLlm("gpt-4o-mini");
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { systemInstruction: emptyContentInstruction as any },
			}),
			false,
		)) {
			/* drain */
		}
		const messages = openaiCreate.mock.calls[0][0].messages;
		expect(messages.some((m: { role: string }) => m.role === "system")).toBe(
			false,
		);
	});

	it('Anthropic forwards system: "" for Content-extracted empty string', async () => {
		const llm = new AnthropicLlm();
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { systemInstruction: emptyContentInstruction as any },
			}),
			false,
		)) {
			/* drain */
		}
		expect(anthropicCreate).toHaveBeenCalledWith(
			expect.objectContaining({ system: "" }),
		);
	});

	it('AI SDK forwards system: "" for Content-extracted empty string', async () => {
		const model = {
			modelId: "m",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel;
		const llm = new AiSdkLlm(model);
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { systemInstruction: emptyContentInstruction as any },
			}),
			false,
		)) {
			/* drain */
		}
		expect(generateText).toHaveBeenCalledWith(
			expect.objectContaining({ system: "" }),
		);
	});

	it('string systemInstruction "" → undefined for all (shared falsy gate)', () => {
		const req = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "q" }] }],
			config: { systemInstruction: "" },
		});
		expect(req.getSystemInstructionText()).toBeUndefined();
	});
});
