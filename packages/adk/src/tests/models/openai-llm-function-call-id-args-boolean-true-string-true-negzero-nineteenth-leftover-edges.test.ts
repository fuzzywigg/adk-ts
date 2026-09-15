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
 * Nineteenth leftover (complement #252 after tip #251): outbound
 * `functionCall.id || ""` / `args || {}`. Fifteenth pinned classic falsy;
 * #252 covers stream id / toolCall.index — not this outbound path. Residual
 * boolean-true / `"true"` / `[]` / `-Infinity` keep; `-0` collapses.
 */
describe("openai-llm function-call id/args boolean-true/string-true/negzero nineteenth leftover edges", () => {
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
		{ label: "boolean true", id: true as any, expected: true },
		{ label: "string true", id: "true", expected: "true" },
		{ label: "empty array", id: [] as any, expected: [] },
		{
			label: "NEGATIVE_INFINITY",
			id: Number.NEGATIVE_INFINITY as any,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "-0", id: -0 as any, expected: "" },
	])('id || "" ($label)', ({ id, expected }) => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id, name: "fn", args: { a: 1 } } }],
		});
		expect(msg.tool_calls[0].id).toEqual(expected);
	});

	it.each([
		{ label: "boolean true", args: true as any, expected: true },
		{ label: "string true", args: "true" as any, expected: "true" },
		{ label: "empty array", args: [] as any, expected: [] },
		{
			label: "NEGATIVE_INFINITY stringifies to null",
			args: Number.NEGATIVE_INFINITY as any,
			expected: null,
		},
		{ label: "-0", args: -0 as any, expected: {} },
	])("args || {} then JSON round-trip ($label)", ({ args, expected }) => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "x", name: "fn", args } }],
		});
		expect(JSON.parse(msg.tool_calls[0].function.arguments)).toEqual(expected);
	});
});
