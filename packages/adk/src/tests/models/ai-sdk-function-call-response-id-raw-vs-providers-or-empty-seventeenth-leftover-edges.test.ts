import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
import { AnthropicLlm } from "../../models/anthropic-llm";
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

vi.mock("ai", () => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

/**
 * Seventeenth leftover: AI SDK forwards functionCall/functionResponse.id raw
 * (no `|| ""`); OpenAI/Anthropic coerce falsy id → "". Distinct from #219
 * inbound stream id / FR outbound OpenAI+Anthropic-only matrices.
 */
describe("ai-sdk function-call-response id raw vs providers or-empty seventeenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let ai: AiSdkLlm;
	let openai: OpenAiLlm;
	let anthropic: AnthropicLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		process.env.ANTHROPIC_API_KEY = "test-key";
		ai = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
		openai = new OpenAiLlm("gpt-4o-mini");
		anthropic = new AnthropicLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		{ label: "undefined", id: undefined },
		{ label: "null", id: null },
		{ label: "0", id: 0 },
		{ label: "false", id: false },
		{ label: "empty", id: "" },
	])('AI SDK FC id raw ($label); providers || ""', ({ id }) => {
		const aiMsg = (ai as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id, name: "fn", args: { a: 1 } } }],
		});
		expect(aiMsg.content[0].toolCallId).toBe(id);

		const oa = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id, name: "fn", args: { a: 1 } } }],
		});
		expect(oa.tool_calls[0].id).toBe("");

		const block = (anthropic as any).partToAnthropicBlock({
			function_call: { id, name: "fn", args: { a: 1 } },
		});
		expect(block.id).toBe("");
	});

	it.each([
		{ label: "zero string", id: "0" },
		{ label: "whitespace", id: " " },
	])("truthy id ($label) kept on all three", ({ id }) => {
		const aiMsg = (ai as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id, name: "fn", args: {} } }],
		});
		expect(aiMsg.content[0].toolCallId).toBe(id);

		const oa = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id, name: "fn", args: {} } }],
		});
		expect(oa.tool_calls[0].id).toBe(id);

		const block = (anthropic as any).partToAnthropicBlock({
			function_call: { id, name: "fn", args: {} },
		});
		expect(block.id).toBe(id);
	});

	it('AI SDK FR id raw null vs OpenAI tool_call_id || ""', () => {
		const aiMsg = (ai as any).contentToAiSdkMessage({
			role: "user",
			parts: [{ functionResponse: { id: null, name: "fn", response: {} } }],
		});
		expect(aiMsg.content[0].toolCallId).toBeNull();

		const oa = (openai as any).contentToOpenAiMessage({
			role: "user",
			parts: [{ functionResponse: { id: null, name: "fn", response: {} } }],
		});
		expect(oa.tool_call_id).toBe("");
	});
});
