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
 * Seventeenth leftover: Anthropic tool_result hardcodes `is_error: false` —
 * never reads error flags from function_response / part. Residual vs fifteenth
 * FR id/args matrices.
 */
describe("anthropic-llm tool-result is-error hardcoded-false seventeenth leftover edges", () => {
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
		{
			label: "response.error true",
			part: {
				function_response: {
					id: "c1",
					name: "fn",
					response: { error: true },
				},
			},
		},
		{
			label: "function_response.is_error true",
			part: {
				function_response: {
					id: "c2",
					name: "fn",
					response: { ok: false },
					is_error: true,
				},
			},
		},
		{
			label: "part.is_error true sibling",
			part: {
				is_error: true,
				function_response: {
					id: "c3",
					name: "fn",
					response: { boom: 1 },
				},
			},
		},
	])("$label still emits is_error:false", ({ part }) => {
		const block = (llm as any).partToAnthropicBlock(part);
		expect(block.type).toBe("tool_result");
		expect(block.is_error).toBe(false);
	});
});
