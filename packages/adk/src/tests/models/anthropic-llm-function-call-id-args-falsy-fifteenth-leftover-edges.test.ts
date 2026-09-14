import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@anthropic-ai/sdk", () => ({
	default: vi.fn(() => ({
		messages: { create: vi.fn() },
	})),
}));

/**
 * Fifteenth leftover: snake_case `function_call.id || ""` / `args || {}`
 * falsy matrix (camel functionCall already throws — sixth asymmetry).
 */
describe("anthropic-llm function-call id args falsy fifteenth leftover edges", () => {
	let llm: AnthropicLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		llm = new AnthropicLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		{ label: "0", id: 0, expected: "" },
		{ label: "false", id: false, expected: "" },
		{ label: "empty", id: "", expected: "" },
		{ label: "zero string", id: "0", expected: "0" },
		{ label: "whitespace", id: " ", expected: " " },
	])('function_call.id || "" ($label)', ({ id, expected }) => {
		const block = (llm as any).partToAnthropicBlock({
			function_call: { id, name: "fn", args: { a: 1 } },
		});
		expect(block).toEqual({
			type: "tool_use",
			id: expected,
			name: "fn",
			input: { a: 1 },
		});
	});

	it.each([
		{ label: "0", args: 0, expected: {} },
		{ label: "false", args: false, expected: {} },
		{ label: "empty string", args: "", expected: {} },
		{ label: "null", args: null, expected: {} },
		{ label: "object", args: { x: 1 }, expected: { x: 1 } },
	])("function_call.args || {} ($label)", ({ args, expected }) => {
		const block = (llm as any).partToAnthropicBlock({
			function_call: { id: "t1", name: "fn", args },
		});
		expect(block.input).toEqual(expected);
	});
});
