import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
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

describe("OpenAiLlm matrix edges (TOKENMAXX leftovers)", () => {
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
		llm = new OpenAiLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	function baseRequest(overrides: Record<string, unknown> = {}) {
		return new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
			...overrides,
		});
	}

	it.each([
		{ label: "undefined model", model: undefined },
		{ label: "null model", model: null as any },
		{ label: "empty model", model: "" },
	])("falls back to constructor model when request model is $label", async ({
		model,
	}) => {
		mockCreate.mockResolvedValue({
			choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
		});

		const responses: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			baseRequest({ model }),
			false,
		)) {
			responses.push(response);
		}

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({ model: "gpt-4o-mini" }),
		);
		expect(responses).toHaveLength(1);
	});

	it.each([
		{ label: "undefined contents", contents: undefined },
		{ label: "null contents", contents: null as any },
	])("coalesces $label to an empty OpenAI messages list", async ({
		contents,
	}) => {
		mockCreate.mockResolvedValue({
			choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
		});

		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({ contents }),
			false,
		)) {
			// drain
		}

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({ messages: [] }),
		);
	});

	it("keeps buffered thought through finish_reason on the same chunk", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: { content: "<thinking>plan" },
							finish_reason: "stop",
						},
					],
					usage: {
						prompt_tokens: 1,
						completion_tokens: 2,
						total_tokens: 3,
					},
				};
			})(),
		);

		const responses: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			baseRequest(),
			true,
		)) {
			responses.push(response);
		}

		const finished = responses.find((r) => r.finishReason === "STOP");
		expect(finished?.content?.parts).toEqual([
			{ text: "<thinking>plan", thought: true },
		]);
		expect(finished?.usageMetadata?.totalTokenCount).toBe(3);
	});

	it("keeps prior thought buffer across a finish chunk that only has tool calls when merge is skipped", async () => {
		const hasInline = vi
			.spyOn(llm as any, "hasInlineData")
			.mockReturnValue(true);

		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: { content: "[thinking] draft" },
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
										id: "t1",
										type: "function",
										function: { name: "noop", arguments: "{}" },
									},
								],
							},
							finish_reason: "stop",
						},
					],
					usage: {
						prompt_tokens: 2,
						completion_tokens: 2,
						total_tokens: 4,
					},
				};
			})(),
		);

		const responses: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			baseRequest(),
			true,
		)) {
			responses.push(response);
		}

		const finished = responses.find((r) => r.finishReason === "STOP");
		expect(finished?.content?.parts).toEqual([
			{ text: "[thinking] draft", thought: true },
			{ functionCall: { id: "t1", name: "noop", args: {} } },
		]);
		hasInline.mockRestore();
	});

	it("yields leftover thought-only content when stream ends with usage and no finish_reason", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: { content: "<thinking>solo" },
							finish_reason: null,
						},
					],
					usage: {
						prompt_tokens: 4,
						completion_tokens: 5,
						total_tokens: 9,
					},
				};
			})(),
		);

		const responses: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			baseRequest(),
			true,
		)) {
			responses.push(response);
		}

		const leftover = responses.find(
			(r) =>
				!r.partial &&
				!r.finishReason &&
				r.content?.parts?.some((p: any) => p.thought) &&
				r.usageMetadata?.totalTokenCount === 9,
		);
		expect(leftover?.content?.parts).toEqual([
			{ text: "<thinking>solo", thought: true },
		]);
	});

	it.each([
		{ label: "undefined arguments", arguments: undefined },
		{ label: "empty arguments", arguments: "" },
	])("parses falsy tool-call $label as empty object on finish", async ({
		arguments: args,
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
										id: "empty-args",
										type: "function",
										function: { name: "noop", arguments: args },
									},
								],
							},
							finish_reason: "tool_calls",
						},
					],
				};
			})(),
		);

		const responses: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			baseRequest(),
			true,
		)) {
			responses.push(response);
		}

		const finished = responses.find((r) => r.finishReason === "STOP");
		expect(finished?.content?.parts).toEqual([
			{
				functionCall: { id: "empty-args", name: "noop", args: {} },
			},
		]);
	});
});
