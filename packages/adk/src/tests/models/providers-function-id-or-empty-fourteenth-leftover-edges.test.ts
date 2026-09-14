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
 * Fourteenth leftover: outbound FC/FR id || "" — falsy → ""; " " / "0" kept.
 */
describe('providers function id || "" fourteenth leftover edges', () => {
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
		{ label: "undefined", id: undefined, expected: "" },
		{ label: "null", id: null, expected: "" },
		{ label: "0", id: 0, expected: "" },
		{ label: "false", id: false, expected: "" },
		{ label: "empty string", id: "", expected: "" },
		{ label: "whitespace", id: " ", expected: " " },
		{ label: 'string "0"', id: "0", expected: "0" },
	])("OpenAI functionCall id $label → $expected", ({ id, expected }) => {
		const msg = (openAi as any).contentToOpenAiMessage({
			role: "assistant",
			parts: [{ functionCall: { id, name: "f", args: {} } }],
		});
		expect(msg.tool_calls[0].id).toBe(expected);
	});

	it.each([
		{ label: "undefined", id: undefined, expected: "" },
		{ label: "null", id: null, expected: "" },
		{ label: "0", id: 0, expected: "" },
		{ label: "false", id: false, expected: "" },
		{ label: "empty string", id: "", expected: "" },
		{ label: "whitespace", id: " ", expected: " " },
		{ label: 'string "0"', id: "0", expected: "0" },
	])("OpenAI functionResponse id $label → $expected", ({ id, expected }) => {
		const msg = (openAi as any).contentToOpenAiMessage({
			role: "user",
			parts: [{ functionResponse: { id, name: "f", response: {} } }],
		});
		expect(msg.tool_call_id).toBe(expected);
	});

	it.each([
		{ label: "undefined", id: undefined, expected: "" },
		{ label: "null", id: null, expected: "" },
		{ label: "0", id: 0, expected: "" },
		{ label: "false", id: false, expected: "" },
		{ label: "empty string", id: "", expected: "" },
		{ label: "whitespace", id: " ", expected: " " },
		{ label: 'string "0"', id: "0", expected: "0" },
	])("Anthropic function_call id $label → $expected", ({ id, expected }) => {
		const block = (anthropic as any).partToAnthropicBlock({
			function_call: { id, name: "f", args: {} },
		});
		expect(block.id).toBe(expected);
	});

	it.each([
		{ label: "undefined", id: undefined, expected: "" },
		{ label: "null", id: null, expected: "" },
		{ label: "0", id: 0, expected: "" },
		{ label: "false", id: false, expected: "" },
		{ label: "empty string", id: "", expected: "" },
		{ label: "whitespace", id: " ", expected: " " },
		{ label: 'string "0"', id: "0", expected: "0" },
	])("Anthropic function_response id $label → $expected", ({
		id,
		expected,
	}) => {
		const block = (anthropic as any).partToAnthropicBlock({
			function_response: { id, response: { result: "x" } },
		});
		expect(block.tool_use_id).toBe(expected);
	});
});
