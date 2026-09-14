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
 * Sixteenth leftover: `function_response.id || ""` falsy matrix on tool_result.
 * Fifteenth covered function_call id/args only; unit test pinned missing id.
 */
describe("anthropic-llm function-response id falsy sixteenth leftover edges", () => {
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
		{ label: "null", id: null, expected: "" },
		{ label: "zero string", id: "0", expected: "0" },
		{ label: "whitespace", id: " ", expected: " " },
	])('function_response.id || "" ($label)', ({ id, expected }) => {
		const block = (llm as any).partToAnthropicBlock({
			function_response: {
				id,
				response: { result: "ok" },
			},
		});
		expect(block).toEqual({
			type: "tool_result",
			tool_use_id: expected,
			content: "ok",
			is_error: false,
		});
	});
});
