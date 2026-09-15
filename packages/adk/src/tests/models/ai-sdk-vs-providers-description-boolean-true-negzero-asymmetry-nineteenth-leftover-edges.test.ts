import type { LanguageModel } from "ai";
import Anthropic from "@anthropic-ai/sdk";
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

vi.mock("@anthropic-ai/sdk");

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: { completions: { create: vi.fn() } },
	})),
}));

vi.mock("ai", () => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #261; lands closed #252): AI SDK keeps
 * raw `description` (no `|| ""`) while OpenAI/Anthropic coalesce. Sixteenth
 * pinned classic falsy asymmetry + whitespace/`"0"` keep-all. Residual
 * boolean-true / `"true"` / `[]` / `-Infinity` keep-all; `-0` AI SDK raw vs
 * OpenAI/Anthropic `""`.
 */
describe("ai-sdk vs providers description boolean-true/negzero asymmetry nineteenth leftover edges", () => {
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
		{ label: "boolean true", description: true as any },
		{ label: "string true", description: "true" },
		{ label: "empty array", description: [] as any },
		{
			label: "NEGATIVE_INFINITY",
			description: Number.NEGATIVE_INFINITY as any,
		},
	])("all providers keep truthy near-miss description ($label)", ({
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

	it("AI SDK keeps SameValueZero -0 while OpenAI/Anthropic coalesce to empty", () => {
		const tools = (aiSdk as any).convertToAiSdkTools({
			contents: [],
			config: {
				tools: [
					{
						functionDeclarations: [
							{ name: "t", description: -0 as any, parameters: {} },
						],
					},
				],
			},
		});
		expect(Object.is(tools.t.description, -0)).toBe(true);
		expect(
			(openai as any).functionDeclarationToOpenAiTool({
				name: "t",
				description: -0 as any,
				parameters: {},
			}).function.description,
		).toBe("");
		expect(
			(anthropic as any).functionDeclarationToAnthropicTool({
				name: "t",
				description: -0 as any,
			}).description,
		).toBe("");
	});
});
