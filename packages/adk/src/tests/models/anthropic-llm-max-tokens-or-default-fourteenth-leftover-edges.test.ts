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
 * Fourteenth leftover: maxOutputTokens || MAX_TOKENS (1024). Sixth only pinned
 * 0 → 1024. Falsy "" / false / null fall back; " " / "0" stay.
 */
describe("anthropic-llm max_tokens || default fourteenth leftover edges", () => {
	let llm: AnthropicLlm;
	let originalEnv: NodeJS.ProcessEnv;
	let mockCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		mockCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			stop_reason: "end_turn",
			usage: { input_tokens: 1, output_tokens: 1 },
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

	async function drain(maxOutputTokens: unknown): Promise<void> {
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { maxOutputTokens } as any,
			}),
			false,
		)) {
			/* drain */
		}
	}

	it.each([
		{ label: "empty string", value: "", expected: 1024 },
		{ label: "false", value: false, expected: 1024 },
		{ label: "null", value: null, expected: 1024 },
		{ label: "0", value: 0, expected: 1024 },
	])("$label maxOutputTokens → 1024", async ({ value, expected }) => {
		await drain(value);
		expect(mockCreate.mock.calls[0][0].max_tokens).toBe(expected);
	});

	it.each([
		{ label: "whitespace", value: " ", expected: " " },
		{ label: 'string "0"', value: "0", expected: "0" },
	])("$label maxOutputTokens is kept", async ({ value, expected }) => {
		await drain(value);
		expect(mockCreate.mock.calls[0][0].max_tokens).toBe(expected);
	});
});
