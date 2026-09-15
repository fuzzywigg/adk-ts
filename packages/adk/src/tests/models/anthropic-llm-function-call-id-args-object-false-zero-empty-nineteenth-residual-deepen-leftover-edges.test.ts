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
		messages: { create: vi.fn() },
	})),
}));

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * snake_case `function_call.id || ""` / `args || {}` — boxed-falsy /
 * `"-Infinity"` / `-1` keep (primitive falsy would coalesce).
 */
describe("anthropic-llm function-call id/args object-false/zero/empty nineteenth residual deepen", () => {
	let llm: AnthropicLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		llm = new AnthropicLlm();
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
	])('function_call.id || "" ($label) kept', ({ id }) => {
		const block = (llm as any).partToAnthropicBlock({
			function_call: { id, name: "fn", args: { a: 1 } },
		});
		expect(block).toEqual({
			type: "tool_use",
			id,
			name: "fn",
			input: { a: 1 },
		});
	});

	it.each([
		{ label: "Object(false)", args: Object(false) as any },
		{ label: "Object(0)", args: Object(0) as any },
		{ label: 'Object("")', args: Object("") as any },
		{ label: "Object(NaN)", args: Object(Number.NaN) as any },
		{ label: 'string "-Infinity"', args: "-Infinity" as any },
		{ label: "number -1", args: -1 as any },
	])("function_call.args || {} ($label) kept", ({ args }) => {
		const block = (llm as any).partToAnthropicBlock({
			function_call: { id: "t1", name: "fn", args },
		});
		expect(block.input).toEqual(args);
	});
});
