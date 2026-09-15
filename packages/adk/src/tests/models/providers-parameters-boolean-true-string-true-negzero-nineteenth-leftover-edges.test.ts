import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
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

vi.mock("ai", () => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #261; lands closed #252):
 * `parameters || {}` then schema transform. Sixteenth pinned classic falsy →
 * `{}`. Residual: SameValueZero `-0` → `{}`; boolean `true` / `"true"` /
 * `-Infinity` keep via `typeof !== "object"` early-return; `[]` maps to `[]`.
 */
describe("providers parameters boolean-true/string-true/negzero nineteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let openai: OpenAiLlm;
	let aiSdk: AiSdkLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		openai = new OpenAiLlm();
		aiSdk = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("SameValueZero -0 parameters coalesce to {} on OpenAI and AI SDK", () => {
		const openaiTool = (openai as any).functionDeclarationToOpenAiTool({
			name: "t",
			description: "d",
			parameters: -0 as any,
		});
		expect(openaiTool.function.parameters).toEqual({});

		const tools = (aiSdk as any).convertToAiSdkTools({
			contents: [],
			config: {
				tools: [
					{
						functionDeclarations: [
							{ name: "t", description: "d", parameters: -0 as any },
						],
					},
				],
			},
		});
		expect(tools.t.inputSchema.schema).toEqual({});
	});

	it.each([
		{ label: "boolean true", parameters: true as any, expected: true },
		{ label: "string true", parameters: "true" as any, expected: "true" },
		{
			label: "NEGATIVE_INFINITY",
			parameters: Number.NEGATIVE_INFINITY as any,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "empty array", parameters: [] as any, expected: [] },
	])("OpenAI keeps truthy near-miss parameters ($label)", ({
		parameters,
		expected,
	}) => {
		const tool = (openai as any).functionDeclarationToOpenAiTool({
			name: "t",
			description: "d",
			parameters,
		});
		expect(tool.function.parameters).toEqual(expected);
	});

	it.each([
		{ label: "boolean true", parameters: true as any, expected: true },
		{ label: "string true", parameters: "true" as any, expected: "true" },
		{
			label: "NEGATIVE_INFINITY",
			parameters: Number.NEGATIVE_INFINITY as any,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "empty array", parameters: [] as any, expected: [] },
	])("AI SDK keeps truthy near-miss parameters ($label)", ({
		parameters,
		expected,
	}) => {
		const tools = (aiSdk as any).convertToAiSdkTools({
			contents: [],
			config: {
				tools: [
					{
						functionDeclarations: [{ name: "t", description: "d", parameters }],
					},
				],
			},
		});
		expect(tools.t.inputSchema.schema).toEqual(expected);
	});
});
