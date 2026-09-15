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
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #261; lands closed #252): stream
 * `id: toolCall.id || ""` vs non-stream raw `id`. Sixteenth pinned classic
 * falsy. Residual boolean `true` / `"true"` / `[]` / `-Infinity` keep on both;
 * SameValueZero `-0` non-stream raw vs stream `""`.
 */
describe("openai-llm stream id boolean-true/string-true/negzero nineteenth leftover edges", () => {
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
		{ label: "boolean true", id: true as any },
		{ label: "string true", id: "true" },
		{ label: "empty array", id: [] as any },
		{ label: "NEGATIVE_INFINITY", id: Number.NEGATIVE_INFINITY as any },
	])("non-stream and stream both keep truthy near-miss id ($label)", ({
		id,
	}) => {
		const nonStream = (llm as any).openAiMessageToLlmResponse(
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
		expect(nonStream.content.parts[0].functionCall.id).toBe(id);

		const stream = (llm as any).createChunkResponse(
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
		expect(stream.content.parts[0].functionCall.id).toBe(id);
	});

	it("non-stream keeps SameValueZero -0 while stream coalesces to empty", () => {
		const nonStream = (llm as any).openAiMessageToLlmResponse(
			{
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: -0 as any,
							type: "function",
							function: { name: "fn", arguments: "{}" },
						},
					],
				},
				finish_reason: "tool_calls",
			},
			undefined,
		);
		expect(Object.is(nonStream.content.parts[0].functionCall.id, -0)).toBe(
			true,
		);

		const stream = (llm as any).createChunkResponse(
			{
				content: null,
				tool_calls: [
					{
						id: -0 as any,
						type: "function",
						function: { name: "fn", arguments: "{}" },
					},
				],
			},
			undefined,
		);
		expect(stream.content.parts[0].functionCall.id).toBe("");
	});
});
