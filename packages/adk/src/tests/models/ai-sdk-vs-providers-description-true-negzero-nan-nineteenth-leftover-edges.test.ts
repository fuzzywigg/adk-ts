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
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #258):
 * AI SDK raw description vs OpenAI/Anthropic `description || ""` after
 * sixteenth whitespace/`"0"`. Residual true/`"true"`/`[]`/`-0`/`NaN`/
 * `±Infinity`.
 */
describe("ai-sdk vs providers description true negzero nan nineteenth leftover edges", () => {
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
		{ label: "-0", description: -0 as any },
		{ label: "NaN", description: Number.NaN as any },
	])('AI SDK keeps falsy near-miss ($label); providers coalesce to ""', ({
		description,
	}) => {
		expect(aiDescription(description)).toBe(description);
		expect(openaiDescription(description)).toBe("");
		expect(anthropicDescription(description)).toBe("");
	});

	it.each([
		{ label: "boolean true", description: true as any },
		{ label: "string true", description: "true" },
		{ label: "empty array", description: [] as any },
		{
			label: "POSITIVE_INFINITY",
			description: Number.POSITIVE_INFINITY as any,
		},
		{
			label: "NEGATIVE_INFINITY",
			description: Number.NEGATIVE_INFINITY as any,
		},
	])("truthy near-miss description kept on all providers ($label)", ({
		description,
	}) => {
		expect(aiDescription(description)).toBe(description);
		expect(openaiDescription(description)).toBe(description);
		expect(anthropicDescription(description)).toBe(description);
	});
});
