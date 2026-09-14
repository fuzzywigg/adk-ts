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
 * Fourteenth leftover: system role `content.parts?.[0]?.text || ""`.
 * Eleventh leftover pinned empty string; 0 / false / null coalesce, while
 * whitespace / "0" stay.
 */
describe("openai-llm system-text or-empty falsy fourteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let llm: OpenAiLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		llm = new OpenAiLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it.each([
		{ label: "0", text: 0 as any, expected: "" },
		{ label: "false", text: false as any, expected: "" },
		{ label: "null", text: null as any, expected: "" },
		{ label: "undefined", text: undefined, expected: "" },
		{ label: "empty", text: "", expected: "" },
		{ label: "whitespace", text: " ", expected: " " },
		{ label: "zero string", text: "0", expected: "0" },
	])("system role coalesces parts[0].text ($label)", ({ text, expected }) => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "system",
				parts: [{ text }],
			}),
		).toEqual({ role: "system", content: expected });
	});

	it("missing parts coalesces to empty system content", () => {
		expect((llm as any).contentToOpenAiMessage({ role: "system" })).toEqual({
			role: "system",
			content: "",
		});
	});
});
