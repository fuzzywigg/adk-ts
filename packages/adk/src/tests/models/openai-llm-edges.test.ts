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

describe("OpenAiLlm leftover edges (TOKENMAXX post #124)", () => {
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

	function baseRequest() {
		return new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
		});
	}

	it("maps nullish contents to empty messages via contents || []", async () => {
		mockCreate.mockResolvedValue({
			choices: [{ message: { content: "x" }, finish_reason: "stop" }],
		});
		const request = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
		});
		(request as any).contents = null;

		for await (const _ of (llm as any).generateContentAsyncImpl(
			request,
			false,
		)) {
			// drain
		}

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({ messages: [] }),
		);
	});

	it("includes thought part on finish_reason when thoughtText is buffered", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: { content: "[thinking] draft" },
							finish_reason: "stop",
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
		expect(finished?.content?.parts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					text: "[thinking] draft",
					thought: true,
				}),
			]),
		);
	});

	it("parses empty streamed tool-call arguments as {}", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "tc-1",
										function: { name: "lookup", arguments: "" },
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

		const responses: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			baseRequest(),
			true,
		)) {
			responses.push(response);
		}

		const finished = responses.find((r) =>
			r.content?.parts?.some((p: any) => p.functionCall),
		);
		expect(finished?.content?.parts?.[0]?.functionCall).toEqual({
			id: "tc-1",
			name: "lookup",
			args: {},
		});
	});

	it("yields post-loop leftover thought when usage remains and finish never cleared buffers", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: { content: "[thinking] leftover" },
							finish_reason: null,
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

		const leftover = responses.find(
			(r) =>
				!r.partial &&
				!r.finishReason &&
				r.content?.parts?.some((p: any) => p.thought) &&
				r.usageMetadata?.totalTokenCount === 3,
		);
		expect(leftover).toBeDefined();
	});
});
