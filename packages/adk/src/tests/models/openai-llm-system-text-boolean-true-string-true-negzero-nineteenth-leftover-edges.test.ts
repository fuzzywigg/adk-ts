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
 * Nineteenth leftover (HEAVY tip-relaunch residual after #248):
 * system role `content.parts?.[0]?.text || ""`. Fourteenth pinned classic
 * falsy + whitespace/`"0"`. Residual boolean `true` / `"true"` / `[]` /
 * `-Infinity` keep; SameValueZero `-0` → `""`.
 */
describe("openai-llm system-text boolean-true/string-true/negzero nineteenth leftover edges", () => {
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
		{ label: "boolean true", text: true as any, expected: true },
		{ label: "string true", text: "true", expected: "true" },
		{ label: "empty array", text: [] as any, expected: [] },
		{
			label: "NEGATIVE_INFINITY",
			text: Number.NEGATIVE_INFINITY as any,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "-0", text: -0 as any, expected: "" },
	])("system role coalesces parts[0].text ($label)", ({ text, expected }) => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "system",
				parts: [{ text }],
			}),
		).toEqual({ role: "system", content: expected });
	});
});
