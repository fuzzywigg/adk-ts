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
 * Seventeenth leftover: AI SDK `input: args` raw; OpenAI/Anthropic `args || {}`.
 * Distinct from #219 parameters `|| {}` (tool declarations) and fifteenth
 * OpenAI/Anthropic outbound args-only matrices.
 */
describe("ai-sdk function-call args raw vs providers or-empty-object seventeenth leftover edges", () => {
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
		{ label: "0", args: 0 },
		{ label: "false", args: false },
		{ label: "empty string", args: "" },
		{ label: "null", args: null },
		{ label: "undefined", args: undefined },
	])("AI SDK keeps falsy args ($label); providers → {}", ({ args }) => {
		const aiMsg = (ai as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "x", name: "fn", args } }],
		});
		expect(aiMsg.content[0].input).toBe(args);

		const oa = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "x", name: "fn", args } }],
		});
		expect(JSON.parse(oa.tool_calls[0].function.arguments)).toEqual({});

		const block = (anthropic as any).partToAnthropicBlock({
			function_call: { id: "x", name: "fn", args },
		});
		expect(block.input).toEqual({});
	});

	it("truthy object args kept on all three", () => {
		const args = { "0": true };
		const aiMsg = (ai as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "x", name: "fn", args } }],
		});
		expect(aiMsg.content[0].input).toEqual(args);

		const oa = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "x", name: "fn", args } }],
		});
		expect(JSON.parse(oa.tool_calls[0].function.arguments)).toEqual(args);

		const block = (anthropic as any).partToAnthropicBlock({
			function_call: { id: "x", name: "fn", args },
		});
		expect(block.input).toEqual(args);
	});
});
