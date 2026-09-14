import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@anthropic-ai/sdk");

/**
 * Fourteenth leftover: description || "" on OpenAI + Anthropic tool mapping.
 * Bare-name default was covered; falsy matrix vs whitespace/"0" was not.
 */
describe('providers functionDeclaration description || "" fourteenth leftover edges', () => {
	let openAi: OpenAiLlm;
	let anthropic: AnthropicLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		process.env.ANTHROPIC_API_KEY = "test-key";
		openAi = new OpenAiLlm("gpt-4o-mini");
		anthropic = new AnthropicLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it.each([
		{ label: "undefined", description: undefined, expected: "" },
		{ label: "null", description: null, expected: "" },
		{ label: "0", description: 0, expected: "" },
		{ label: "false", description: false, expected: "" },
		{ label: "empty string", description: "", expected: "" },
		{ label: "whitespace", description: " ", expected: " " },
		{ label: 'string "0"', description: "0", expected: "0" },
	])("OpenAI $label → $expected", ({ description, expected }) => {
		const tool = (openAi as any).functionDeclarationToOpenAiTool({
			name: "f",
			description,
			parameters: {},
		});
		expect(tool.function.description).toBe(expected);
	});

	it.each([
		{ label: "undefined", description: undefined, expected: "" },
		{ label: "null", description: null, expected: "" },
		{ label: "0", description: 0, expected: "" },
		{ label: "false", description: false, expected: "" },
		{ label: "empty string", description: "", expected: "" },
		{ label: "whitespace", description: " ", expected: " " },
		{ label: 'string "0"', description: "0", expected: "0" },
	])("Anthropic $label → $expected", ({ description, expected }) => {
		const tool = (anthropic as any).functionDeclarationToAnthropicTool({
			name: "f",
			description,
			parameters: {},
		});
		expect(tool.description).toBe(expected);
	});
});
