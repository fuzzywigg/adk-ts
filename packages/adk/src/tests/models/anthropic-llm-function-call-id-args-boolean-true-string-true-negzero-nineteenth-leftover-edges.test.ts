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
 * Nineteenth leftover (complement #252 after tip #251): snake_case
 * `function_call.id || ""` / `args || {}`. Fifteenth pinned classic falsy.
 * Residual boolean-true / `"true"` / `[]` / `-Infinity` keep; `-0` collapses.
 */
describe("anthropic-llm function-call id/args boolean-true/string-true/negzero nineteenth leftover edges", () => {
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
		{ label: "boolean true", id: true as any, expected: true },
		{ label: "string true", id: "true", expected: "true" },
		{ label: "empty array", id: [] as any, expected: [] },
		{
			label: "NEGATIVE_INFINITY",
			id: Number.NEGATIVE_INFINITY as any,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "-0", id: -0 as any, expected: "" },
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
		{ label: "boolean true", args: true as any, expected: true },
		{ label: "string true", args: "true" as any, expected: "true" },
		{ label: "empty array", args: [] as any, expected: [] },
		{
			label: "NEGATIVE_INFINITY",
			args: Number.NEGATIVE_INFINITY as any,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "-0", args: -0 as any, expected: {} },
	])("function_call.args || {} ($label)", ({ args, expected }) => {
		const block = (llm as any).partToAnthropicBlock({
			function_call: { id: "t1", name: "fn", args },
		});
		expect(block.input).toEqual(expected);
	});
});
