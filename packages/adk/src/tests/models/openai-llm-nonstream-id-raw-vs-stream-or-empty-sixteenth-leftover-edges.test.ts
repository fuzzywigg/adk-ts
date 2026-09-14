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
 * Sixteenth leftover: stream createChunkResponse uses `id: toolCall.id || ""`;
 * non-stream openAiMessageToLlmResponse keeps raw `id: toolCall.id`. Fifteenth
 * compared empty name gates only.
 */
describe("openai-llm nonstream id raw vs stream or-empty sixteenth leftover edges", () => {
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
		{ label: "0", id: 0 as any },
		{ label: "false", id: false as any },
		{ label: "empty", id: "" },
		{ label: "undefined", id: undefined },
	])("non-stream keeps raw falsy id ($label)", ({ id }) => {
		const resp = (llm as any).openAiMessageToLlmResponse(
			{
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id,
							type: "function",
							function: { name: "fn", arguments: "{}" },
						},
					],
				},
				finish_reason: "tool_calls",
			},
			undefined,
		);
		expect(resp.content.parts[0].functionCall.id).toBe(id);
	});

	it.each([
		{ label: "0", id: 0 as any, expected: "" },
		{ label: "false", id: false as any, expected: "" },
		{ label: "empty", id: "", expected: "" },
		{ label: "undefined", id: undefined, expected: "" },
		{ label: "zero string", id: "0", expected: "0" },
		{ label: "whitespace", id: " ", expected: " " },
	])('stream coalesces id via || "" ($label)', ({ id, expected }) => {
		const resp = (llm as any).createChunkResponse(
			{
				content: null,
				tool_calls: [
					{
						id,
						type: "function",
						function: { name: "fn", arguments: "{}" },
					},
				],
			},
			undefined,
		);
		expect(resp.content.parts[0].functionCall.id).toBe(expected);
	});
});
