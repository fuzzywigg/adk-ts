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
 * Fifteenth leftover: stream createChunkResponse gates on
 * `type === "function" && function?.name`; non-stream openAiMessageToLlmResponse
 * only checks `type === "function"` (empty name still emits).
 */
describe("openai-llm nonstream empty name vs stream gate fifteenth leftover edges", () => {
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

	it("non-stream emits functionCall even when name is empty string", () => {
		const resp = (llm as any).openAiMessageToLlmResponse(
			{
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "tc-1",
							type: "function",
							function: { name: "", arguments: "{}" },
						},
					],
				},
				finish_reason: "tool_calls",
			},
			undefined,
		);
		expect(resp.content.parts).toEqual([
			{
				functionCall: {
					id: "tc-1",
					name: "",
					args: {},
				},
			},
		]);
	});

	it("stream createChunkResponse skips function tool_call with empty name", () => {
		const resp = (llm as any).createChunkResponse(
			{
				content: null,
				tool_calls: [
					{
						id: "tc-1",
						type: "function",
						function: { name: "", arguments: "{}" },
					},
				],
			},
			undefined,
		);
		expect(resp.content).toBeUndefined();
	});

	it("stream createChunkResponse keeps function tool_call with truthy name", () => {
		const resp = (llm as any).createChunkResponse(
			{
				content: null,
				tool_calls: [
					{
						id: "tc-2",
						type: "function",
						function: { name: "do_thing", arguments: '{"a":1}' },
					},
				],
			},
			undefined,
		);
		expect(resp.content.parts).toEqual([
			{
				functionCall: {
					id: "tc-2",
					name: "do_thing",
					args: { a: 1 },
				},
			},
		]);
	});
});
