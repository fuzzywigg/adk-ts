import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";
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
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip 96457a9 / #248):
 * `toolCall.index || 0` after seventh classic falsy. `-0`/`NaN` merge into
 * slot 0; boolean `true` is truthy so skips `|| 0`, but `arr[true]` is a
 * non-index property — `for...of` / `.length` orphan it (not emitted).
 */
describe("openai-llm toolCall.index negzero nan true nineteenth leftover edges", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;
	let mockCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		mockCreate = vi.fn();
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		}));
		llm = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	async function drain(
		req: LlmRequest,
		stream = false,
	): Promise<LlmResponse[]> {
		const out: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			req,
			stream,
		)) {
			out.push(response);
		}
		return out;
	}

	function baseRequest() {
		return new LlmRequest({
			model: "gpt-4o",
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		});
	}

	it.each([
		{ label: "-0", index: -0 },
		{ label: "NaN", index: Number.NaN },
	])("falsy near-miss index $label coalesces into slot 0", async ({
		index,
	}) => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call-0",
										function: { name: "alpha", arguments: '{"a":' },
									},
								],
							},
							finish_reason: null,
						},
					],
				};
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index,
										function: { name: "_beta", arguments: "1}" },
									},
								],
							},
							finish_reason: "tool_calls",
						},
					],
				};
			})(),
		);

		const responses = await drain(baseRequest(), true);
		const final = responses.find((r) => r.finishReason === "STOP");
		expect(final?.content?.parts).toEqual([
			{
				functionCall: {
					id: "call-0",
					name: "alpha_beta",
					args: { a: 1 },
				},
			},
		]);
	});

	it("boolean true index is orphaned by array for-of (only slot 0 emits)", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call-a",
										type: "function",
										function: { name: "a", arguments: "{}" },
									},
									{
										index: true as any,
										id: "call-true",
										type: "function",
										function: { name: "t", arguments: "{}" },
									},
								],
							},
							finish_reason: "tool_calls",
						},
					],
				};
			})(),
		);

		const responses = await drain(baseRequest(), true);
		const final = responses.find((r) => r.finishReason === "STOP");
		expect(final?.content?.parts).toEqual([
			{ functionCall: { id: "call-a", name: "a", args: {} } },
		]);
		expect(
			final?.content?.parts?.some(
				(p: any) => p.functionCall?.id === "call-true",
			),
		).toBe(false);
	});
});
