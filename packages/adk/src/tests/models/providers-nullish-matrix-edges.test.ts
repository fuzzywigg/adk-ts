import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
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

vi.mock("@anthropic-ai/sdk");

const { streamText, generateText } = vi.hoisted(() => ({
	streamText: vi.fn(),
	generateText: vi.fn(),
}));

vi.mock("ai", () => ({
	streamText,
	generateText,
}));

describe("Provider nullish matrix edges (TOKENMAXX leftovers)", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("GoogleLlm", () => {
		it.each([
			{ label: "undefined contents", contents: undefined },
			{ label: "null contents", contents: null as any },
		])("generateContentAsyncImpl coalesces $label before convertContents", async ({
			contents,
		}) => {
			process.env.GOOGLE_API_KEY = "abc";
			const generateContent = vi.fn().mockResolvedValue({
				candidates: [
					{
						content: { role: "model", parts: [{ text: "ok" }] },
						finishReason: "STOP",
					},
				],
			});
			(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
				() => ({
					models: { generateContent, generateContentStream: vi.fn() },
				}),
			);

			const llm = new GoogleLlm();
			const convertSpy = vi.spyOn(llm as any, "convertContents");

			for await (const _ of (llm as any).generateContentAsyncImpl(
				new LlmRequest({ contents }),
				false,
			)) {
				// drain
			}

			expect(convertSpy).toHaveBeenCalledWith([]);
		});

		it("convertContents uses empty text when parts and content are both falsy", () => {
			process.env.GOOGLE_API_KEY = "abc";
			const llm = new GoogleLlm();
			expect(
				(llm as any).convertContents([
					{ role: "user" },
					{ role: "user", parts: undefined, content: "" },
					{ role: "user", parts: undefined, content: null },
				]),
			).toEqual([
				{ role: "user", parts: [{ text: "" }] },
				{ role: "user", parts: [{ text: "" }] },
				{ role: "user", parts: [{ text: "" }] },
			]);
		});
	});

	describe("AnthropicLlm", () => {
		beforeEach(() => {
			process.env.ANTHROPIC_API_KEY = "test-api-key";
		});

		it.each([
			{ label: "undefined contents", contents: undefined },
			{ label: "null contents", contents: null as any },
		])("generateContentAsyncImpl coalesces $label to empty messages", async ({
			contents,
		}) => {
			const create = vi.fn().mockResolvedValue({
				content: [{ type: "text", text: "ok" }],
				stop_reason: "end_turn",
				usage: { input_tokens: 1, output_tokens: 1 },
			});
			(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
				() => ({
					messages: { create },
				}),
			);

			const llm = new AnthropicLlm();
			for await (const _ of (llm as any).generateContentAsyncImpl(
				new LlmRequest({ contents }),
				false,
			)) {
				// drain
			}

			expect(create).toHaveBeenCalledWith(
				expect.objectContaining({ messages: [] }),
			);
		});

		it.each([
			{ label: "undefined parts", parts: undefined },
			{ label: "null parts", parts: null },
		])("contentToAnthropicMessage coalesces $label to an empty content list", ({
			parts,
		}) => {
			const llm = new AnthropicLlm();
			expect(
				(llm as any).contentToAnthropicMessage({
					role: "user",
					parts,
				}),
			).toEqual({
				role: "user",
				content: [],
			});
		});
	});

	describe("AiSdkLlm", () => {
		it.each([
			{ label: "undefined contents", contents: undefined },
			{ label: "null contents", contents: null as any },
		])("convertToAiSdkMessages coalesces $label to []", ({ contents }) => {
			const llm = new AiSdkLlm("openai/gpt-4o-mini");
			expect(
				(llm as any).convertToAiSdkMessages(new LlmRequest({ contents })),
			).toEqual([]);
		});
	});

	describe("LlmRequest.getSystemInstructionText", () => {
		it("falls through to String() for Content-like objects without parts", () => {
			const req = new LlmRequest({
				config: {
					systemInstruction: { role: "system" } as any,
				},
			});
			expect(req.getSystemInstructionText()).toBe("[object Object]");
		});
	});
});
