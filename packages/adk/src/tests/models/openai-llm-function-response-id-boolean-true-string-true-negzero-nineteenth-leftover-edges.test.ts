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
 * `functionResponse.id || ""`. Sixteenth pinned classic falsy; #252 stream-id
 * residual is inbound tool_call.id. Residual boolean-true / `"true"` / `[]` /
 * `-Infinity` keep; SameValueZero `-0` → `""`.
 */
describe("openai-llm function-response id boolean-true/string-true/negzero nineteenth leftover edges", () => {
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
	])('tool_call_id || "" ($label)', ({ id, expected }) => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "user",
			parts: [{ functionResponse: { id, response: { ok: true } } }],
		});
		expect(msg.tool_call_id).toEqual(expected);
	});
});
