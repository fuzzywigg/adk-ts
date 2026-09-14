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

vi.mock("@anthropic-ai/sdk", () => ({
	default: vi.fn(() => ({
		messages: { create: vi.fn() },
	})),
}));

/**
 * Fourteenth leftover: `description || ""` on OpenAI / Anthropic tool mapping.
 * Happy / missing description covered; falsy 0 / false / "" coalesce, while
 * whitespace / "0" stay.
 */
describe("openai-anthropic description || empty fourteenth leftover edges", () => {
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
		{ label: "0", description: 0 as any, expected: "" },
		{ label: "false", description: false as any, expected: "" },
		{ label: "empty", description: "", expected: "" },
		{ label: "null", description: null as any, expected: "" },
		{ label: "undefined", description: undefined, expected: "" },
		{ label: "whitespace", description: " ", expected: " " },
		{ label: "zero string", description: "0", expected: "0" },
	])('OpenAI description || "" ($label)', ({ description, expected }) => {
		const tool = (openai as any).functionDeclarationToOpenAiTool({
			name: "t",
			description,
			parameters: {},
		});
		expect(tool.function.description).toBe(expected);
	});

	it.each([
		{ label: "0", description: 0 as any, expected: "" },
		{ label: "false", description: false as any, expected: "" },
		{ label: "empty", description: "", expected: "" },
		{ label: "whitespace", description: " ", expected: " " },
		{ label: "zero string", description: "0", expected: "0" },
	])('Anthropic description || "" ($label)', ({ description, expected }) => {
		const tool = (anthropic as any).functionDeclarationToAnthropicTool({
			name: "t",
			description,
		});
		expect(tool.description).toBe(expected);
	});
});
