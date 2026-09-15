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
 * Nineteenth leftover residual deepen (complements #269 toolCall.index):
 * `toolCall.index || 0` — number `1` alone leaves a sparse hole at 0 that
 * TypeErrors on finalize `for-of`; with slot 0 filled both emit; `Object(true)` /
 * `"Infinity"` / `{}` are truthy non-index keys orphaned by array `for-of`.
 */
describe("openai-llm toolCall.index object-true/one/infinity nineteenth residual deepen", () => {
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

	it("number 1 alone leaves sparse hole at 0 → TypeError on finalize for-of", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 1,
										id: "call-1",
										function: { name: "beta", arguments: '{"b":1}' },
									},
								],
							},
							finish_reason: "tool_calls",
						},
					],
				};
			})(),
		);

		await expect(drain(baseRequest(), true)).rejects.toThrow(
			/Cannot read properties of undefined/,
		);
	});

	it("number 1 with slot 0 filled emits both tool calls", async () => {
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
										function: { name: "alpha", arguments: "{}" },
									},
									{
										index: 1,
										id: "call-1",
										function: { name: "beta", arguments: '{"b":1}' },
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
		const final = responses.find((r) => r.finishReason != null);
		const names =
			final?.content?.parts
				?.map((p: any) => p.functionCall?.name)
				.filter(Boolean) ?? [];
		expect(names).toEqual(["alpha", "beta"]);
	});

	it.each([
		{ label: "Object(true)", index: Object(true) },
		{ label: 'string "Infinity"', index: "Infinity" },
		{ label: "empty object", index: {} },
	])("truthy non-index $label orphans tool call from for-of", async ({
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
										index,
										id: "call-orphan",
										function: { name: "ghost", arguments: "{}" },
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
							delta: {},
							finish_reason: "tool_calls",
						},
					],
				};
			})(),
		);

		const responses = await drain(baseRequest(), true);
		const final = responses.find((r) => r.finishReason != null);
		const names =
			final?.content?.parts
				?.map((p: any) => p.functionCall?.name)
				.filter(Boolean) ?? [];
		expect(names).not.toContain("ghost");
	});
});
