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
 * Fifteenth leftover: outbound `functionCall.id || ""` / `args || {}` falsy
 * matrix beyond empty/null covered by multi-tool leftovers.
 */
describe("openai-llm function-call id args falsy fifteenth leftover edges", () => {
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
		{ label: "0", id: 0, expected: "" },
		{ label: "false", id: false, expected: "" },
		{ label: "empty", id: "", expected: "" },
		{ label: "zero string", id: "0", expected: "0" },
		{ label: "whitespace", id: " ", expected: " " },
	])('id || "" ($label)', ({ id, expected }) => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id, name: "fn", args: { a: 1 } } }],
		});
		expect(msg.tool_calls[0].id).toBe(expected);
	});

	it.each([
		{ label: "0", args: 0, expected: {} },
		{ label: "false", args: false, expected: {} },
		{ label: "empty string", args: "", expected: {} },
		{ label: "null", args: null, expected: {} },
		{
			label: "zero string object key",
			args: { "0": true },
			expected: { "0": true },
		},
	])("args || {} ($label)", ({ args, expected }) => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "x", name: "fn", args } }],
		});
		expect(JSON.parse(msg.tool_calls[0].function.arguments)).toEqual(expected);
	});
});
