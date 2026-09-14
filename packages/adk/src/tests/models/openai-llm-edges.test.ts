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

describe("OpenAiLlm leftover edges (post #124)", () => {
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

	it("falls back to this.model when llmRequest.model is undefined", async () => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: { role: "assistant", content: "hi" },
					finish_reason: "stop",
				},
			],
			usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
		});

		const req = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		});
		delete (req as any).model;

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({ model: "gpt-4o-mini" }),
		);
	});

	it("streams finish_reason with accumulated thoughtText as thought part", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: { content: "[thinking] plan-a" },
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
			new LlmRequest({
				model: "gpt-4o",
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		)) {
			responses.push(response);
		}

		const withThought = responses.filter((r) =>
			r.content?.parts?.some((p: any) => p.thought === true),
		);
		expect(withThought.length).toBeGreaterThan(0);
		expect(
			withThought.some((r) =>
				r.content?.parts?.some(
					(p: any) => p.thought === true && String(p.text).includes("plan-a"),
				),
			),
		).toBe(true);
	});

	it("parses empty tool arguments as {} on stream finish", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "tc1",
										type: "function",
										function: { name: "lookup", arguments: "" },
									},
								],
							},
							finish_reason: "tool_calls",
						},
					],
					usage: {
						prompt_tokens: 1,
						completion_tokens: 1,
						total_tokens: 2,
					},
				};
			})(),
		);

		const responses: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		)) {
			responses.push(response);
		}

		const finished = responses.find((r) =>
			r.content?.parts?.some((p: any) => p.functionCall),
		);
		expect(finished?.content?.parts?.[0]).toEqual(
			expect.objectContaining({
				functionCall: expect.objectContaining({
					name: "lookup",
					args: {},
				}),
			}),
		);
	});

	it("final leftover yield keeps thoughtText when usage arrives after text", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: { content: "[thinking] leftover" },
							finish_reason: null,
						},
					],
				};
				yield {
					choices: [
						{
							delta: {},
							finish_reason: null,
						},
					],
					usage: {
						prompt_tokens: 2,
						completion_tokens: 3,
						total_tokens: 5,
					},
				};
			})(),
		);

		const responses: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		)) {
			responses.push(response);
		}

		expect(
			responses.some((r) =>
				r.content?.parts?.some(
					(p: any) => p.thought === true && String(p.text).includes("leftover"),
				),
			),
		).toBe(true);
	});

	it("maps undefined contents to an empty message list", async () => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				},
			],
		});

		const req = new LlmRequest();
		(req as any).contents = undefined;

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({ messages: [] }),
		);
	});
});
