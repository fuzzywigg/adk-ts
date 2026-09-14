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
 * Seventeenth leftover: `JSON.parse(toolCall.function.arguments || "{}")` on
 * createChunkResponse + openAiMessageToLlmResponse. models-coalesce only pinned
 * omitted/undefined → {}; residual falsy matrix + truthy near-miss parse edges.
 */
describe("openai-llm arguments or-empty json falsy matrix seventeenth leftover edges", () => {
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
		{ label: "0", arguments: 0 as any },
		{ label: "false", arguments: false as any },
		{ label: "null", arguments: null as any },
		{ label: "undefined", arguments: undefined },
		{ label: "empty string", arguments: "" },
	])('createChunkResponse arguments || "{}" → {} ($label)', ({
		arguments: args,
	}) => {
		const resp = (llm as any).createChunkResponse({
			tool_calls: [
				{
					index: 0,
					id: "c1",
					type: "function",
					function: { name: "fn", arguments: args },
				},
			],
		});
		expect(resp.content.parts[0].functionCall.args).toEqual({});
	});

	it.each([
		{ label: "0", arguments: 0 as any },
		{ label: "false", arguments: false as any },
		{ label: "null", arguments: null as any },
		{ label: "undefined", arguments: undefined },
		{ label: "empty string", arguments: "" },
	])('openAiMessageToLlmResponse arguments || "{}" → {} ($label)', ({
		arguments: args,
	}) => {
		const resp = (llm as any).openAiMessageToLlmResponse({
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
		expect(resp.content.parts[0].functionCall.args).toEqual({});
	});

	it('truthy "0" parses to number 0 (not object {})', () => {
		const chunk = (llm as any).createChunkResponse({
			tool_calls: [
				{
					index: 0,
					id: "c1",
					type: "function",
					function: { name: "fn", arguments: "0" },
				},
			],
		});
		expect(chunk.content.parts[0].functionCall.args).toBe(0);

		const nonstream = (llm as any).openAiMessageToLlmResponse({
			message: {
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "c1",
						type: "function",
						function: { name: "fn", arguments: "0" },
					},
				],
			},
			finish_reason: "tool_calls",
		});
		expect(nonstream.content.parts[0].functionCall.args).toBe(0);
	});

	it("truthy whitespace arguments throw on JSON.parse", () => {
		expect(() =>
			(llm as any).createChunkResponse({
				tool_calls: [
					{
						index: 0,
						id: "c1",
						type: "function",
						function: { name: "fn", arguments: " " },
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
							function: { name: "fn", arguments: " " },
						},
					],
				},
				finish_reason: "tool_calls",
			}),
		).toThrow();
	});

	it("well-formed object JSON still parses (control)", () => {
		const resp = (llm as any).createChunkResponse({
			tool_calls: [
				{
					index: 0,
					id: "c1",
					type: "function",
					function: { name: "fn", arguments: '{"a":1}' },
				},
			],
		});
		expect(resp.content.parts[0].functionCall.args).toEqual({ a: 1 });
	});
});
