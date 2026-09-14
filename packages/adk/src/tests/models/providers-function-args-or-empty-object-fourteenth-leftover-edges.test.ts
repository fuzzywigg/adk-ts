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
 * Fourteenth leftover: functionCall.args || {} — falsy → {}; object / " "
 * kept (OpenAI JSON.stringifies; Anthropic passes input through).
 */
describe("providers function args || empty-object fourteenth leftover edges", () => {
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
		{ label: "undefined", args: undefined, expected: "{}" },
		{ label: "null", args: null, expected: "{}" },
		{ label: "0", args: 0, expected: "{}" },
		{ label: "false", args: false, expected: "{}" },
		{ label: "empty string", args: "", expected: "{}" },
	])("OpenAI functionCall args $label → {}", ({ args, expected }) => {
		const msg = (openAi as any).contentToOpenAiMessage({
			role: "assistant",
			parts: [{ functionCall: { id: "c1", name: "f", args } }],
		});
		expect(msg.tool_calls[0].function.arguments).toBe(expected);
	});

	it('OpenAI whitespace args stringify as "\\u0020" JSON string', () => {
		const msg = (openAi as any).contentToOpenAiMessage({
			role: "assistant",
			parts: [{ functionCall: { id: "c1", name: "f", args: " " } }],
		});
		expect(msg.tool_calls[0].function.arguments).toBe('" "');
	});

	it("OpenAI object args are JSON.stringified", () => {
		const msg = (openAi as any).contentToOpenAiMessage({
			role: "assistant",
			parts: [{ functionCall: { id: "c1", name: "f", args: { q: 1 } } }],
		});
		expect(msg.tool_calls[0].function.arguments).toBe('{"q":1}');
	});

	it.each([
		{ label: "undefined", args: undefined, expected: {} },
		{ label: "null", args: null, expected: {} },
		{ label: "0", args: 0, expected: {} },
		{ label: "false", args: false, expected: {} },
		{ label: "empty string", args: "", expected: {} },
	])("Anthropic function_call args $label → {}", ({ args, expected }) => {
		const block = (anthropic as any).partToAnthropicBlock({
			function_call: { id: "c1", name: "f", args },
		});
		expect(block.input).toEqual(expected);
	});

	it("Anthropic whitespace args are kept as input", () => {
		const block = (anthropic as any).partToAnthropicBlock({
			function_call: { id: "c1", name: "f", args: " " },
		});
		expect(block.input).toBe(" ");
	});

	it("Anthropic object args are kept by reference shape", () => {
		const block = (anthropic as any).partToAnthropicBlock({
			function_call: { id: "c1", name: "f", args: { q: 1 } },
		});
		expect(block.input).toEqual({ q: 1 });
	});
});
