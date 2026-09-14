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
 * Sixteenth leftover: outbound `functionResponse.id || ""` falsy matrix.
 * Fifteenth covered functionCall id/args; twelfth covered FR response body.
 */
describe("openai-llm function-response id falsy sixteenth leftover edges", () => {
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
		{ label: "null", id: null, expected: "" },
		{ label: "undefined", id: undefined, expected: "" },
		{ label: "zero string", id: "0", expected: "0" },
		{ label: "whitespace", id: " ", expected: " " },
	])('tool_call_id || "" ($label)', ({ id, expected }) => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "user",
			parts: [{ functionResponse: { id, response: { ok: true } } }],
		});
		expect(msg.tool_call_id).toBe(expected);
	});
});
