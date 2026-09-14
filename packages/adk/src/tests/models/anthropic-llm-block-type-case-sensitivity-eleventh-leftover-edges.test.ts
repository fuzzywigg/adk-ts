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
		messages: {
			create: vi.fn(),
		},
	})),
}));

/**
 * Eleventh leftover: anthropicBlockToPart type === "text" | "tool_use" is
 * case-sensitive — TEXT / Tool_Use / etc. throw Unsupported.
 */
describe("anthropic-llm block-type case-sensitivity eleventh leftover edges", () => {
	let llm: AnthropicLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		llm = new AnthropicLlm("claude-3-5-sonnet");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		"TEXT",
		"Text",
		" text",
		"text ",
	])("block type %j throws Unsupported (not exact text)", (type) => {
		expect(() =>
			(llm as any).anthropicBlockToPart({ type, text: "hello" }),
		).toThrow(/Unsupported Anthropic content block type/);
	});

	it.each([
		"TOOL_USE",
		"Tool_Use",
		"tool_Use",
		"tool-use",
	])("block type %j throws Unsupported (not exact tool_use)", (type) => {
		expect(() =>
			(llm as any).anthropicBlockToPart({
				type,
				id: "tu-1",
				name: "lookup",
				input: {},
			}),
		).toThrow(/Unsupported Anthropic content block type/);
	});

	it('exact "text" still maps (control)', () => {
		expect(
			(llm as any).anthropicBlockToPart({ type: "text", text: "hi" }),
		).toEqual({
			text: "hi",
		});
	});

	it('exact "tool_use" still maps (control)', () => {
		expect(
			(llm as any).anthropicBlockToPart({
				type: "tool_use",
				id: "tu",
				name: "lookup",
				input: { q: 1 },
			}),
		).toEqual({
			function_call: { id: "tu", name: "lookup", args: { q: 1 } },
		});
	});
});
