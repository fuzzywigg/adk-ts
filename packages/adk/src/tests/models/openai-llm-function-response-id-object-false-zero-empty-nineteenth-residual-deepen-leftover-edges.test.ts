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
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * outbound `functionResponse.id || ""` — boxed-falsy / `"-Infinity"` / `-1`
 * keep.
 */
describe("openai-llm function-response id object-false/zero/empty nineteenth residual deepen", () => {
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
		{ label: "Object(false)", id: Object(false) as any },
		{ label: "Object(0)", id: Object(0) as any },
		{ label: 'Object("")', id: Object("") as any },
		{ label: "Object(NaN)", id: Object(Number.NaN) as any },
		{ label: 'string "-Infinity"', id: "-Infinity" as any },
		{ label: "number -1", id: -1 as any },
	])('tool_call_id || "" ($label) kept', ({ id }) => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "user",
			parts: [{ functionResponse: { id, response: { ok: true } } }],
		});
		expect(msg.tool_call_id).toEqual(id);
	});
});
