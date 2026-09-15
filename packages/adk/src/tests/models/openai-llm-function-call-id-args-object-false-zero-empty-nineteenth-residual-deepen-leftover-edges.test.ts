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
 * outbound `functionCall.id || ""` / `args || {}` — boxed-falsy /
 * `"-Infinity"` / `-1` keep (JSON null for Object(NaN)).
 */
describe("openai-llm function-call id/args object-false/zero/empty nineteenth residual deepen", () => {
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
	])('id || "" ($label) kept', ({ id }) => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id, name: "fn", args: { a: 1 } } }],
		});
		expect(msg.tool_calls[0].id).toEqual(id);
	});

	it.each([
		{ label: "Object(false)", args: Object(false) as any, expected: false },
		{ label: "Object(0)", args: Object(0) as any, expected: 0 },
		{ label: 'Object("")', args: Object("") as any, expected: "" },
		{ label: "Object(NaN)", args: Object(Number.NaN) as any, expected: null },
		{
			label: 'string "-Infinity"',
			args: "-Infinity" as any,
			expected: "-Infinity",
		},
		{ label: "number -1", args: -1 as any, expected: -1 },
	])("args || {} then JSON round-trip ($label)", ({ args, expected }) => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "x", name: "fn", args } }],
		});
		expect(JSON.parse(msg.tool_calls[0].function.arguments)).toEqual(expected);
	});
});
