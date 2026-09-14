import Anthropic from "@anthropic-ai/sdk";
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

vi.mock("@anthropic-ai/sdk");

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: {
			completions: {
				create: vi.fn(),
			},
		},
	})),
}));

describe("AnthropicLlm camelCase/maxTokens sixth leftover edges (post #150)", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let mockMessagesCreate: ReturnType<typeof vi.fn>;
	let llm: AnthropicLlm;
	let openai: OpenAiLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		process.env.OPENAI_API_KEY = "test-key";
		mockMessagesCreate = vi.fn();
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create: mockMessagesCreate },
			}),
		);
		llm = new AnthropicLlm();
		openai = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it("camelCase functionCall parts throw on Anthropic but succeed on OpenAI", () => {
		const part = {
			functionCall: { id: "c1", name: "lookup", args: { q: 1 } },
		};

		expect(() => (llm as any).partToAnthropicBlock(part)).toThrow(
			/Unsupported part type for Anthropic conversion/,
		);

		const message = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [part],
		});
		expect(message.role).toBe("assistant");
		expect(message.tool_calls?.[0]?.function?.name).toBe("lookup");
	});

	it("camelCase functionResponse parts throw on Anthropic but map to tool role on OpenAI", () => {
		const part = {
			functionResponse: { id: "r1", response: { ok: true } },
		};

		expect(() => (llm as any).partToAnthropicBlock(part)).toThrow(
			/Unsupported part type for Anthropic conversion/,
		);

		expect(
			(openai as any).contentToOpenAiMessage({
				role: "user",
				parts: [part],
			}),
		).toEqual({
			role: "tool",
			tool_call_id: "r1",
			content: JSON.stringify({ ok: true }),
		});
	});

	it("snake_case function_call works on Anthropic while OpenAI multi-part conversion throws", () => {
		const block = (llm as any).partToAnthropicBlock({
			function_call: { id: "c2", name: "snake", args: { a: 2 } },
		});
		expect(block).toEqual({
			type: "tool_use",
			id: "c2",
			name: "snake",
			input: { a: 2 },
		});

		expect(() =>
			(openai as any).contentToOpenAiMessage({
				role: "model",
				parts: [{ function_call: { id: "c2", name: "snake", args: { a: 2 } } }],
			}),
		).toThrow(/Unsupported part type for OpenAI conversion/);
	});

	it("falsy maxOutputTokens 0 falls back to 1024 via || default", async () => {
		mockMessagesCreate.mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});

		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { maxOutputTokens: 0 },
			}),
			false,
		)) {
			/* drain */
		}

		expect(mockMessagesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				max_tokens: 1024,
			}),
		);
	});

	it("anthropicBlockToPart throws on unknown block types", () => {
		expect(() =>
			(llm as any).anthropicBlockToPart({ type: "thinking", thinking: "x" }),
		).toThrow(/Unsupported Anthropic content block type/);
	});
});
