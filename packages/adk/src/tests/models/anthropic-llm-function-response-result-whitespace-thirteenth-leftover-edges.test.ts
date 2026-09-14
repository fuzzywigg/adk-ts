import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@anthropic-ai/sdk");

/**
 * Thirteenth leftover: function_response.response?.result truthiness —
 * leftover already pins 0/false/"" → content "". Whitespace / "0" / objects
 * String() through.
 */
describe("anthropic-llm function_response result whitespace thirteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let llm: AnthropicLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create: vi.fn() },
			}),
		);
		llm = new AnthropicLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it('result " " is kept as tool_result content', () => {
		const block = (llm as any).partToAnthropicBlock({
			function_response: {
				id: "tr-ws",
				response: { result: " " },
			},
		});
		expect(block.content).toBe(" ");
		expect(block.tool_use_id).toBe("tr-ws");
	});

	it('result "0" is kept (truthy string)', () => {
		const block = (llm as any).partToAnthropicBlock({
			function_response: {
				id: "tr-0",
				response: { result: "0" },
			},
		});
		expect(block.content).toBe("0");
	});

	it("object result String()s to [object Object]", () => {
		const block = (llm as any).partToAnthropicBlock({
			function_response: {
				id: "tr-obj",
				response: { result: { ok: true } },
			},
		});
		expect(block.content).toBe("[object Object]");
	});

	it("sibling output without result still yields empty content", () => {
		const block = (llm as any).partToAnthropicBlock({
			function_response: {
				id: "tr-out",
				response: { output: "ignored" },
			},
		});
		expect(block.content).toBe("");
	});
});
