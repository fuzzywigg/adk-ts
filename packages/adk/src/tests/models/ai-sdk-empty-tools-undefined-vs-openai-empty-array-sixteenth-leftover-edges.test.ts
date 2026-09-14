import type { LanguageModel } from "ai";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
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

const { generateText } = vi.hoisted(() => ({
	generateText: vi.fn(),
}));

vi.mock("ai", () => ({
	generateText,
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

/**
 * Sixteenth leftover: AI SDK `Object.keys(tools).length > 0 ? tools : undefined`
 * omits empty tools dict; OpenAI empty `functionDeclarations` still sends
 * `tools: []` + truthy `tool_choice: "auto"`.
 */
describe("ai-sdk empty tools undefined vs openai empty array sixteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("AI SDK convertToAiSdkTools returns {} when no functionDeclarations", () => {
		const llm = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
		const tools = (llm as any).convertToAiSdkTools(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { tools: [{ googleSearch: {} } as any] },
			}),
		);
		expect(tools).toEqual({});
	});

	it("AI SDK generate path omits tools when dict is empty", async () => {
		generateText.mockResolvedValue({
			text: "ok",
			toolCalls: [],
			usage: undefined,
			finishReason: "stop",
		});
		const llm = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { tools: [{ googleSearch: {} } as any] },
			}),
			false,
		)) {
			/* drain */
		}
		expect(generateText.mock.calls[0][0].tools).toBeUndefined();
	});

	it("OpenAI empty functionDeclarations still wires tools=[] and tool_choice auto", async () => {
		const create = vi.fn().mockResolvedValue({
			choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
		});
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create } },
		}));
		const llm = new OpenAiLlm("gpt-4o-mini");
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: {
					tools: [{ functionDeclarations: [] } as any],
				},
			}),
			false,
		)) {
			/* drain */
		}
		expect(create.mock.calls[0][0].tools).toEqual([]);
		expect(create.mock.calls[0][0].tool_choice).toBe("auto");
	});

	it("OpenAI missing functionDeclarations omits tools and tool_choice", async () => {
		const create = vi.fn().mockResolvedValue({
			choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
		});
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create } },
		}));
		const llm = new OpenAiLlm("gpt-4o-mini");
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			false,
		)) {
			/* drain */
		}
		expect(create.mock.calls[0][0].tools).toBeUndefined();
		expect(create.mock.calls[0][0].tool_choice).toBeUndefined();
	});
});
