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
 * Twelfth leftover: partToAnthropicBlock prefers `if (part.text)` first.
 * Empty-string text is falsy so function_call wins; whitespace text wins.
 */
describe("anthropic-llm empty-text vs function-call twelfth leftover edges", () => {
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
		vi.clearAllMocks();
	});

	it("empty-string text loses to function_call (tool_use)", () => {
		expect(
			(llm as any).partToAnthropicBlock({
				text: "",
				function_call: { id: "c1", name: "search", args: { q: 1 } },
			}),
		).toEqual({
			type: "tool_use",
			id: "c1",
			name: "search",
			input: { q: 1 },
		});
	});

	it("whitespace text wins over function_call", () => {
		expect(
			(llm as any).partToAnthropicBlock({
				text: " ",
				function_call: { id: "c2", name: "search", args: {} },
			}),
		).toEqual({
			type: "text",
			text: " ",
		});
	});

	it("non-empty text still prefers text (control)", () => {
		expect(
			(llm as any).partToAnthropicBlock({
				text: "hello",
				function_call: { id: "c3", name: "search", args: {} },
			}),
		).toEqual({
			type: "text",
			text: "hello",
		});
	});

	it("falsy 0 text also loses to function_call", () => {
		expect(
			(llm as any).partToAnthropicBlock({
				text: 0,
				function_call: { id: "c4", name: "fn", args: {} },
			}),
		).toEqual({
			type: "tool_use",
			id: "c4",
			name: "fn",
			input: {},
		});
	});
});
