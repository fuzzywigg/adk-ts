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
 * Sixteenth leftover: AI SDK keeps raw `description: funcDecl.description`
 * (no `|| ""`); OpenAI/Anthropic coalesce via `description || ""`. Fourteenth
 * covered providers only.
 */
describe("ai-sdk vs providers description or-empty asymmetry sixteenth leftover edges", () => {
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

	it.each([
		{ label: "0", description: 0 as any },
		{ label: "false", description: false as any },
		{ label: "empty", description: "" },
		{ label: "null", description: null as any },
		{ label: "undefined", description: undefined },
	])('AI SDK keeps raw falsy description ($label); providers coalesce to ""', ({
		description,
	}) => {
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
		expect(tools.t.description).toBe(description);

		expect(
			(openai as any).functionDeclarationToOpenAiTool({
				name: "t",
				description,
				parameters: {},
			}).function.description,
		).toBe("");

		expect(
			(anthropic as any).functionDeclarationToAnthropicTool({
				name: "t",
				description,
			}).description,
		).toBe("");
	});

	it.each([
		{ label: "whitespace", description: " " },
		{ label: "zero string", description: "0" },
	])("truthy near-miss description kept on all providers ($label)", ({
		description,
	}) => {
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
		expect(tools.t.description).toBe(description);
		expect(
			(openai as any).functionDeclarationToOpenAiTool({
				name: "t",
				description,
				parameters: {},
			}).function.description,
		).toBe(description);
		expect(
			(anthropic as any).functionDeclarationToAnthropicTool({
				name: "t",
				description,
			}).description,
		).toBe(description);
	});
});
