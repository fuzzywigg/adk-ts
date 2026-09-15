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
 * Twentieth leftover residual deepen (complements #282 object-true/one/infinity):
 * AI SDK raw vs OpenAI/Anthropic `description || ""` —
 * boxed falsy `Object(false)` / `Object(0)` / `Object(NaN)` kept on all providers.
 */
describe("ai-sdk vs providers description object-false/zero/nan twentieth residual deepen", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let openai: OpenAiLlm;
	let anthropic: AnthropicLlm;
	let aiSdk: AiSdkLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		process.env.ANTHROPIC_API_KEY = "test-key";
		openai = new OpenAiLlm();
		anthropic = new AnthropicLlm();
		aiSdk = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	function aiDescription(description: any) {
		const tools = (aiSdk as any).convertToAiSdkTools({
			contents: [],
			config: {
				tools: [
					{
						functionDeclarations: [{ name: "t", description, parameters: {} }],
					},
				],
			},
		});
		return tools.t.description;
	}

	function openaiDescription(description: any) {
		return (openai as any).functionDeclarationToOpenAiTool({
			name: "t",
			description,
			parameters: {},
		}).function.description;
	}

	function anthropicDescription(description: any) {
		return (anthropic as any).functionDeclarationToAnthropicTool({
			name: "t",
			description,
		}).description;
	}

	it.each([
		{ label: "Object(false)", description: Object(false) },
		{ label: "Object(0)", description: Object(0) },
		{ label: "Object(NaN)", description: Object(Number.NaN) },
	])("boxed residual description kept on all providers ($label)", ({
		description,
	}) => {
		expect(aiDescription(description)).toBe(description);
		expect(openaiDescription(description)).toBe(description);
		expect(anthropicDescription(description)).toBe(description);
	});
});
