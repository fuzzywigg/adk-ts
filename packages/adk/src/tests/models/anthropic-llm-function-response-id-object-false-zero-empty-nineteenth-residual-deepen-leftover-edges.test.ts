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
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `function_response.id || ""` on tool_result — boxed-falsy / `"-Infinity"` /
 * `-1` keep.
 */
describe("anthropic-llm function-response id object-false/zero/empty nineteenth residual deepen", () => {
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
		{ label: "Object(false)", id: Object(false) as any },
		{ label: "Object(0)", id: Object(0) as any },
		{ label: 'Object("")', id: Object("") as any },
		{ label: "Object(NaN)", id: Object(Number.NaN) as any },
		{ label: 'string "-Infinity"', id: "-Infinity" as any },
		{ label: "number -1", id: -1 as any },
	])('function_response.id || "" ($label) kept', ({ id }) => {
		const block = (llm as any).partToAnthropicBlock({
			function_response: {
				id,
				response: { result: "ok" },
			},
		});
		expect(block).toEqual({
			type: "tool_result",
			tool_use_id: id,
			content: "ok",
			is_error: false,
		});
	});
});
