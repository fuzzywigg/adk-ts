import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * Sixteenth leftover: single-part fast path `parts.length === 1 && parts[0].text`.
 * Falsy non-string 0 / false fall into multipart `partToOpenAiContent`, which
 * throws without text/inline_data. Eleventh pinned empty-string only.
 */
describe("openai-llm single-part falsy nonstring text sixteenth leftover edges", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		llm = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		{ label: "0", text: 0 as any },
		{ label: "false", text: false as any },
		{ label: "null", text: null as any },
		{ label: "empty", text: "" },
	])("falsy parts[0].text ($label) skips single-part path and throws", ({
		text,
	}) => {
		expect(() =>
			(llm as any).contentToOpenAiMessage({
				role: "user",
				parts: [{ text }],
			}),
		).toThrow(/Unsupported part type/);
	});

	it.each([
		{ label: "whitespace", text: " " },
		{ label: "zero string", text: "0" },
	])("truthy near-miss text ($label) stays on single-part path", ({ text }) => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "user",
				parts: [{ text }],
			}),
		).toEqual({ role: "user", content: text });
	});
});
