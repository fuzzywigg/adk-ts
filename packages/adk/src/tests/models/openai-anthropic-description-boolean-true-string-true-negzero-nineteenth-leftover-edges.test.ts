import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after #248):
 * `description || ""` on OpenAI / Anthropic tool mapping. Fourteenth pinned
 * classic falsy + whitespace/`"0"`. Residual boolean `true` / `"true"` /
 * `[]` / `-Infinity` keep; SameValueZero `-0` collapses to `""`.
 */
describe("openai/anthropic description boolean-true/string-true/negzero nineteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let openai: OpenAiLlm;
	let anthropic: AnthropicLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		process.env.ANTHROPIC_API_KEY = "test-key";
		openai = new OpenAiLlm();
		anthropic = new AnthropicLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it.each([
		{ label: "boolean true", description: true as any, expected: true },
		{ label: "string true", description: "true", expected: "true" },
		{ label: "empty array", description: [] as any, expected: [] },
		{
			label: "NEGATIVE_INFINITY",
			description: Number.NEGATIVE_INFINITY as any,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "-0", description: -0 as any, expected: "" },
	])('OpenAI description || "" ($label)', ({ description, expected }) => {
		const tool = (openai as any).functionDeclarationToOpenAiTool({
			name: "t",
			description,
			parameters: {},
		});
		expect(tool.function.description).toEqual(expected);
	});

	it.each([
		{ label: "boolean true", description: true as any, expected: true },
		{ label: "string true", description: "true", expected: "true" },
		{ label: "empty array", description: [] as any, expected: [] },
		{
			label: "NEGATIVE_INFINITY",
			description: Number.NEGATIVE_INFINITY as any,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "-0", description: -0 as any, expected: "" },
	])('Anthropic description || "" ($label)', ({ description, expected }) => {
		const tool = (anthropic as any).functionDeclarationToAnthropicTool({
			name: "t",
			description,
		});
		expect(tool.description).toEqual(expected);
	});
});
