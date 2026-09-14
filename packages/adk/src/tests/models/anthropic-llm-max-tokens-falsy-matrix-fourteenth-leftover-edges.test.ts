import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";
import { LlmRequest } from "../../models/llm-request";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@anthropic-ai/sdk");

/**
 * Fourteenth leftover: `max_tokens: maxOutputTokens || MAX_TOKENS(1024)`.
 * Sixth leftover only pinned `0`. false / "" / NaN also fall back; " " / "0"
 * stay truthy and are forwarded.
 */
describe("anthropic-llm max-tokens falsy matrix fourteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let mockCreate: ReturnType<typeof vi.fn>;
	let llm: AnthropicLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		mockCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create: mockCreate },
			}),
		);
		llm = new AnthropicLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		{ label: "false", value: false },
		{ label: "empty string", value: "" },
		{ label: "null", value: null },
		{ label: "NaN", value: Number.NaN },
	])("falsy maxOutputTokens ($label) falls back to 1024", async ({ value }) => {
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { maxOutputTokens: value as any },
			}),
			false,
		)) {
			/* drain */
		}
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({ max_tokens: 1024 }),
		);
	});

	it.each([
		{ label: "whitespace", value: " " },
		{ label: "zero string", value: "0" },
	])("truthy maxOutputTokens ($label) is forwarded", async ({ value }) => {
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { maxOutputTokens: value as any },
			}),
			false,
		)) {
			/* drain */
		}
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({ max_tokens: value }),
		);
	});
});
