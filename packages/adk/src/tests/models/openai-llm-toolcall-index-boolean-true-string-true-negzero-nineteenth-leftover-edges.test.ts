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
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #261; lands closed #252):
 * `const index = toolCall.index || 0`. Seventh pinned classic falsy merge into
 * slot 0. Residual: SameValueZero `-0` still merges into slot 0; boolean
 * `true` / `"true"` / `[]` / `-Infinity` become sparse non-index keys that
 * `for...of` over `length` skips (dropped from the final tool-call parts).
 */
describe("openai-llm toolcall-index boolean-true/string-true/negzero nineteenth leftover edges", () => {
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

	it("SameValueZero -0 index merges into slot 0 with index:0 sibling", async () => {
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
										index: -0 as any,
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

	it.each([
		{ label: "boolean true", index: true as any },
		{ label: "string true", index: "true" as any },
		{ label: "empty array", index: [] as any },
		{ label: "NEGATIVE_INFINITY", index: Number.NEGATIVE_INFINITY as any },
	])("truthy near-miss index ($label) is sparse-key skipped by length for-of", async ({
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
										id: "call-a",
										type: "function",
										function: { name: "a", arguments: "{}" },
									},
									{
										index,
										id: "call-b",
										type: "function",
										function: { name: "b", arguments: "{}" },
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
	});
});
