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
 * Eighteenth leftover: `JSON.parse(arguments || "{}")` residual after
 * seventeenth falsy / `"0"` / whitespace matrix. Boolean `true` and string
 * `"true"` both parse to boolean `true`; `-0` coalesces to `{}`; `[]` and
 * `NEGATIVE_INFINITY` throw on parse.
 */
describe("openai-llm arguments boolean-true string-true parse eighteenth leftover edges", () => {
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
		{ label: "boolean true", arguments: true as any },
		{ label: "string true", arguments: "true" },
	])("createChunkResponse + nonstream parse $label → boolean true", ({
		arguments: args,
	}) => {
		const chunk = (llm as any).createChunkResponse({
			tool_calls: [
				{
					index: 0,
					id: "c1",
					type: "function",
					function: { name: "fn", arguments: args },
				},
			],
		});
		expect(chunk.content.parts[0].functionCall.args).toBe(true);

		const nonstream = (llm as any).openAiMessageToLlmResponse({
			message: {
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "c1",
						type: "function",
						function: { name: "fn", arguments: args },
					},
				],
			},
			finish_reason: "tool_calls",
		});
		expect(nonstream.content.parts[0].functionCall.args).toBe(true);
	});

	it("-0 SameValueZero-collapses via || {} on both paths", () => {
		const chunk = (llm as any).createChunkResponse({
			tool_calls: [
				{
					index: 0,
					id: "c1",
					type: "function",
					function: { name: "fn", arguments: -0 as any },
				},
			],
		});
		expect(chunk.content.parts[0].functionCall.args).toEqual({});

		const nonstream = (llm as any).openAiMessageToLlmResponse({
			message: {
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "c1",
						type: "function",
						function: { name: "fn", arguments: -0 as any },
					},
				],
			},
			finish_reason: "tool_calls",
		});
		expect(nonstream.content.parts[0].functionCall.args).toEqual({});
	});

	it.each([
		{ label: "empty array", arguments: [] as any },
		{ label: "NEGATIVE_INFINITY", arguments: Number.NEGATIVE_INFINITY as any },
	])("truthy near-miss $label throws on JSON.parse", ({ arguments: args }) => {
		expect(() =>
			(llm as any).createChunkResponse({
				tool_calls: [
					{
						index: 0,
						id: "c1",
						type: "function",
						function: { name: "fn", arguments: args },
					},
				],
			}),
		).toThrow();

		expect(() =>
			(llm as any).openAiMessageToLlmResponse({
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "c1",
							type: "function",
							function: { name: "fn", arguments: args },
						},
					],
				},
				finish_reason: "tool_calls",
			}),
		).toThrow();
	});
});
