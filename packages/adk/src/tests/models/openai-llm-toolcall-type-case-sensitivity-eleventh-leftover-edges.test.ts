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
		chat: {
			completions: {
				create: vi.fn(),
			},
		},
	})),
}));

/**
 * Eleventh leftover: toolCall.type === "function" is case-sensitive in both
 * openAiMessageToLlmResponse and createChunkResponse.
 */
describe("openai-llm toolCall.type case-sensitivity eleventh leftover edges", () => {
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
		"FUNCTION",
		"Function",
		" function",
		"function ",
	])("openAiMessageToLlmResponse drops tool_calls with type %j", (type) => {
		const response = (llm as any).openAiMessageToLlmResponse(
			{
				message: {
					content: null,
					tool_calls: [
						{
							id: "tc-1",
							type,
							function: { name: "lookup", arguments: "{}" },
						},
					],
				},
				finish_reason: "tool_calls",
			},
			undefined,
		);
		expect(response.content?.parts).toEqual([]);
	});

	it('exact type "function" is kept (control)', () => {
		const response = (llm as any).openAiMessageToLlmResponse(
			{
				message: {
					content: null,
					tool_calls: [
						{
							id: "tc-ok",
							type: "function",
							function: { name: "lookup", arguments: '{"q":1}' },
						},
					],
				},
				finish_reason: "tool_calls",
			},
			undefined,
		);
		expect(response.content?.parts).toEqual([
			{
				functionCall: { id: "tc-ok", name: "lookup", args: { q: 1 } },
			},
		]);
	});

	it.each([
		"FUNCTION",
		"Function",
		"Tool",
	])("createChunkResponse drops delta tool_calls with type %j", (type) => {
		const response = (llm as any).createChunkResponse(
			{
				tool_calls: [
					{
						id: "tc-d",
						type,
						function: { name: "x", arguments: "{}" },
					},
				],
			},
			undefined,
		);
		expect(response.content).toBeUndefined();
	});

	it('chunk exact type "function" with name is kept (control)', () => {
		const response = (llm as any).createChunkResponse(
			{
				tool_calls: [
					{
						id: "tc-c",
						type: "function",
						function: { name: "search", arguments: "{}" },
					},
				],
			},
			undefined,
		);
		expect(response.content?.parts).toEqual([
			{
				functionCall: { id: "tc-c", name: "search", args: {} },
			},
		]);
	});
});
