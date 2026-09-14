import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";
import type { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";

vi.mock("@anthropic-ai/sdk");
vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

describe("AnthropicLlm leftover edges (post #144)", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "fake-anthropic-key";
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it("supportedModels and constructor defaults", () => {
		expect(AnthropicLlm.supportedModels()).toEqual([
			"claude-3-.*",
			"claude-.*-4.*",
		]);
		expect(new AnthropicLlm().model).toBe("claude-3-5-sonnet-20241022");
		expect(new AnthropicLlm("claude-custom").model).toBe("claude-custom");
	});

	it("connect throws with concrete model name", () => {
		const llm = new AnthropicLlm("claude-live");
		expect(() => llm.connect({} as LlmRequest)).toThrow(
			"Live connection is not supported for claude-live.",
		);
	});

	it("throws when ANTHROPIC_API_KEY is missing on first client use", async () => {
		delete process.env.ANTHROPIC_API_KEY;
		const llm = new AnthropicLlm();
		const request = {
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
			config: {},
			getSystemInstructionText: () => "",
		} as unknown as LlmRequest;
		await expect(
			(llm as any).generateContentAsyncImpl(request).next(),
		).rejects.toThrow(/ANTHROPIC_API_KEY environment variable is required/);
	});

	it("reuses Anthropic client across generate calls", async () => {
		const mockMessagesCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});
		(Anthropic as any).mockImplementation(() => ({
			messages: { create: mockMessagesCreate },
		}));
		const llm = new AnthropicLlm();
		const request = {
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
			config: {},
			getSystemInstructionText: () => "sys",
		} as unknown as LlmRequest;

		await (llm as any).generateContentAsyncImpl(request).next();
		await (llm as any).generateContentAsyncImpl(request).next();

		expect(Anthropic).toHaveBeenCalledTimes(1);
		expect(Anthropic).toHaveBeenCalledWith({ apiKey: "fake-anthropic-key" });
		expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
		expect(mockMessagesCreate).toHaveBeenCalledWith(
			expect.objectContaining({ system: "sys" }),
		);
	});

	it("omits tools when tools[0] lacks functionDeclarations", async () => {
		const mockMessagesCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});
		(Anthropic as any).mockImplementation(() => ({
			messages: { create: mockMessagesCreate },
		}));
		const llm = new AnthropicLlm();
		await (llm as any)
			.generateContentAsyncImpl({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { tools: [{ someOtherShape: true }] },
				getSystemInstructionText: () => "",
			} as unknown as LlmRequest)
			.next();

		expect(mockMessagesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: undefined,
				tool_choice: undefined,
			}),
		);
	});

	it("forwards non-array message content from contentToAnthropicMessage", async () => {
		const mockMessagesCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});
		(Anthropic as any).mockImplementation(() => ({
			messages: { create: mockMessagesCreate },
		}));
		const llm = new AnthropicLlm();
		vi.spyOn(llm as any, "contentToAnthropicMessage").mockReturnValue({
			role: "user",
			content: "plain string content",
		});

		await (llm as any)
			.generateContentAsyncImpl({
				contents: [{ role: "user", parts: [{ text: "ignored" }] }],
				config: {},
				getSystemInstructionText: () => "",
			} as unknown as LlmRequest)
			.next();

		expect(mockMessagesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				messages: [{ role: "user", content: "plain string content" }],
			}),
		);
	});

	it("contentToAnthropicMessage maps missing parts to []", () => {
		const llm = new AnthropicLlm();
		expect((llm as any).contentToAnthropicMessage({ role: "model" })).toEqual({
			role: "assistant",
			content: [],
		});
	});

	it("anthropicMessageToLlmResponse maps stop_reason and usage", () => {
		const llm = new AnthropicLlm();
		const response = (llm as any).anthropicMessageToLlmResponse({
			content: [{ type: "text", text: "done" }],
			usage: { input_tokens: 3, output_tokens: 5 },
			stop_reason: "max_tokens",
		});
		expect(response).toBeInstanceOf(LlmResponse);
		expect(response.finishReason).toBe("MAX_TOKENS");
		expect(response.usageMetadata).toEqual({
			promptTokenCount: 3,
			candidatesTokenCount: 5,
			totalTokenCount: 8,
		});
		expect(response.content).toEqual({
			role: "model",
			parts: [{ text: "done" }],
		});
	});

	it("updateTypeString leaves no-type nodes but walks nested items", () => {
		const llm = new AnthropicLlm();
		const schema: Record<string, any> = {
			items: { type: "BOOLEAN" },
		};
		(llm as any).updateTypeString(schema);
		expect(schema.items.type).toBe("boolean");
		expect("type" in schema).toBe(false);
	});
});
