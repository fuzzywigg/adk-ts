import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";
import { GoogleLlm } from "../../models/google-llm";
import { LlmRequest } from "../../models/llm-request";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
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

vi.mock("@anthropic-ai/sdk", () => ({
	default: vi.fn(),
}));

/**
 * Tenth leftover: `llmRequest.model || this.model` — empty string falls back.
 * OpenAI matrix already covers this; Google/Anthropic undefined only — deepen here.
 * Distinct from #174/#171 role/provider case leftovers.
 */
describe("Google/Anthropic model || this.model empty-string tenth leftover (post #176)", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let mockGenerateContent: ReturnType<typeof vi.fn>;
	let mockMessagesCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.GOOGLE_API_KEY = "g-key";
		process.env.ANTHROPIC_API_KEY = "a-key";
		vi.clearAllMocks();

		mockGenerateContent = vi.fn().mockResolvedValue({
			candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }],
		});
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: mockGenerateContent,
					generateContentStream: vi.fn(),
				},
			}),
		);

		mockMessagesCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			stop_reason: "end_turn",
			usage: { input_tokens: 1, output_tokens: 1 },
		});
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create: mockMessagesCreate },
			}),
		);
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		{ label: "empty string", model: "" },
		{ label: "null", model: null as any },
		{ label: "undefined", model: undefined },
	])("GoogleLlm falls back to constructor model when request model is $label", async ({
		model,
	}) => {
		const llm = new GoogleLlm("gemini-custom-fallback");
		const req = new LlmRequest({
			model,
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		});

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect(mockGenerateContent).toHaveBeenCalledWith(
			expect.objectContaining({ model: "gemini-custom-fallback" }),
		);
	});

	it("GoogleLlm keeps non-empty request model", async () => {
		const llm = new GoogleLlm("gemini-custom-fallback");
		const req = new LlmRequest({
			model: "gemini-request-model",
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		});

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect(mockGenerateContent).toHaveBeenCalledWith(
			expect.objectContaining({ model: "gemini-request-model" }),
		);
	});

	it.each([
		{ label: "empty string", model: "" },
		{ label: "null", model: null as any },
		{ label: "undefined", model: undefined },
	])("AnthropicLlm falls back to constructor model when request model is $label", async ({
		model,
	}) => {
		const llm = new AnthropicLlm("claude-custom-fallback");
		const req = new LlmRequest({
			model,
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		});

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect(mockMessagesCreate).toHaveBeenCalledWith(
			expect.objectContaining({ model: "claude-custom-fallback" }),
		);
	});

	it("AnthropicLlm keeps non-empty request model", async () => {
		const llm = new AnthropicLlm("claude-custom-fallback");
		const req = new LlmRequest({
			model: "claude-request-model",
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		});

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect(mockMessagesCreate).toHaveBeenCalledWith(
			expect.objectContaining({ model: "claude-request-model" }),
		);
	});

	it("whitespace-only model is truthy so Google does not fall back", async () => {
		const llm = new GoogleLlm("gemini-custom-fallback");
		const req = new LlmRequest({
			model: " ",
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		});

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect(mockGenerateContent).toHaveBeenCalledWith(
			expect.objectContaining({ model: " " }),
		);
	});
});
