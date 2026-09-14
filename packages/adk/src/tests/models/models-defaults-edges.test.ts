import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
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

vi.mock("ai", () => ({
	generateText: vi.fn().mockResolvedValue({
		text: "ok",
		usage: { promptTokens: 1, completionTokens: 1 },
	}),
	streamText: vi.fn(),
	tool: vi.fn((t) => t),
	jsonSchema: vi.fn((s) => s),
}));

describe("model defaults leftover edges (post #124)", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		vi.clearAllMocks();
		process.env.GOOGLE_API_KEY = "g-key";
		process.env.ANTHROPIC_API_KEY = "a-key";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("GoogleLlm convertContents falls back when parts are missing", () => {
		const llm = new GoogleLlm("gemini-2.0-flash");
		const converted = (llm as any).convertContents([
			{ role: "user", content: "plain-fallback" },
			{ role: "assistant", parts: [{ text: "kept" }] },
			{ role: "user" },
		]);

		expect(converted[0]).toEqual({
			role: "user",
			parts: [{ text: "plain-fallback" }],
		});
		expect(converted[1]).toEqual({
			role: "model",
			parts: [{ text: "kept" }],
		});
		expect(converted[2]).toEqual({
			role: "user",
			parts: [{ text: "" }],
		});
	});

	it("GoogleLlm generateContentAsyncImpl uses this.model when request model is unset", async () => {
		const generateContent = vi.fn().mockResolvedValue({
			candidates: [
				{
					content: { role: "model", parts: [{ text: "g" }] },
					finishReason: "STOP",
				},
			],
		});
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: { generateContent, generateContentStream: vi.fn() },
			}),
		);

		const llm = new GoogleLlm("gemini-2.0-flash");
		const req = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		});
		delete (req as any).model;

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect(generateContent).toHaveBeenCalledWith(
			expect.objectContaining({ model: "gemini-2.0-flash" }),
		);
	});

	it("AnthropicLlm contentToAnthropicMessage uses empty array when parts missing", () => {
		const llm = new AnthropicLlm("claude-3-5-sonnet-latest");
		const msg = (llm as any).contentToAnthropicMessage({
			role: "user",
		});
		expect(msg).toEqual({ role: "user", content: [] });
	});

	it("AnthropicLlm falls back to this.model when request model is unset", async () => {
		const create = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			stop_reason: "end_turn",
			usage: { input_tokens: 1, output_tokens: 1 },
		});
		(Anthropic as any).mockImplementation(() => ({
			messages: { create },
		}));

		const llm = new AnthropicLlm("claude-3-5-sonnet-latest");
		const req = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		});
		delete (req as any).model;

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({ model: "claude-3-5-sonnet-latest" }),
		);
	});

	it("AiSdkLlm convertToAiSdkMessages treats missing contents as empty", () => {
		const llm = new AiSdkLlm({
			modelId: "test-model",
			provider: "mock",
			specificationVersion: "v2",
		} as any);
		const req = new LlmRequest();
		(req as any).contents = undefined;
		expect((llm as any).convertToAiSdkMessages(req)).toEqual([]);
	});

	it("LlmRequest.getSystemInstructionText stringifies non-string non-Content values", () => {
		const req = new LlmRequest();
		(req as any).config = { systemInstruction: 42 };
		expect(req.getSystemInstructionText()).toBe("42");

		(req as any).config = { systemInstruction: { role: "system" } };
		expect(req.getSystemInstructionText()).toBe("[object Object]");

		(req as any).config = { systemInstruction: null };
		expect(req.getSystemInstructionText()).toBeUndefined();
	});
});
