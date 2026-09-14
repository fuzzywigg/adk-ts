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

describe("OpenAiLlm fifth leftover edges (post #146)", () => {
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

	it("empty functionDeclarations array is truthy so tools=[] and tool_choice=auto", async () => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				},
			],
		});

		await drain(
			new LlmRequest({
				model: "gpt-4o",
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: {
					tools: [{ functionDeclarations: [] }],
				} as any,
			}),
		);

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: [],
				tool_choice: "auto",
			}),
		);
	});

	it("tools[0] without functionDeclarations leaves tools and tool_choice undefined", async () => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				},
			],
		});

		await drain(
			new LlmRequest({
				model: "gpt-4o",
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: {
					tools: [{ googleSearch: {} }],
				} as any,
			}),
		);

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: undefined,
				tool_choice: undefined,
			}),
		);
	});

	it.each([
		"",
		undefined,
	])("client getter throws when OPENAI_API_KEY is falsy (%j)", async (key) => {
		if (key === undefined) {
			delete process.env.OPENAI_API_KEY;
		} else {
			process.env.OPENAI_API_KEY = key;
		}
		const fresh = new OpenAiLlm("gpt-4o-mini");

		await expect(async () => {
			for await (const _ of (fresh as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "q" }] }],
				}),
				false,
			)) {
				/* drain */
			}
		}).rejects.toThrow(/OPENAI_API_KEY/);
	});

	it("stream finish with no text and unnamed tool slots yields empty parts", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "c1",
										type: "function",
										function: { arguments: "{}" },
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

		const responses = await drain(
			new LlmRequest({
				model: "gpt-4o",
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		);

		const finals = responses.filter((r) => r.finishReason);
		expect(finals.length).toBeGreaterThan(0);
		expect(finals[finals.length - 1].content?.parts).toEqual([]);
		expect(finals[finals.length - 1].finishReason).toBe("STOP");
	});

	it("createChunkResponse skips non-function tool_call types", () => {
		const response = (llm as any).createChunkResponse({
			tool_calls: [
				{
					index: 0,
					id: "custom-1",
					type: "custom",
					function: { name: "should_skip", arguments: "{}" },
				},
				{
					index: 1,
					id: "fn-1",
					type: "function",
					function: { name: "real_tool", arguments: '{"a":1}' },
				},
			],
		});

		expect(response.content?.parts).toEqual([
			{
				functionCall: {
					id: "fn-1",
					name: "real_tool",
					args: { a: 1 },
				},
			},
		]);
	});

	it("sparse accumulatedToolCalls holes throw when finish iterates undefined slots", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 2,
										id: "late",
										type: "function",
										function: { name: "late_tool", arguments: "{}" },
									},
								],
							},
							finish_reason: null,
						},
					],
				};
				yield {
					choices: [{ delta: {}, finish_reason: "tool_calls" }],
				};
			})(),
		);

		await expect(
			drain(
				new LlmRequest({
					model: "gpt-4o",
					contents: [{ role: "user", parts: [{ text: "q" }] }],
				}),
				true,
			),
		).rejects.toThrow();
	});

	it("accumulated tool calls with empty names are skipped on finish", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "empty",
										type: "function",
										function: { arguments: "{}" },
									},
									{
										index: 1,
										id: "named",
										type: "function",
										function: { name: "named_tool", arguments: "{}" },
									},
								],
							},
							finish_reason: null,
						},
					],
				};
				yield {
					choices: [{ delta: {}, finish_reason: "tool_calls" }],
				};
			})(),
		);

		const responses = await drain(
			new LlmRequest({
				model: "gpt-4o",
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		);

		const final = responses.find((r) => r.finishReason === "STOP");
		expect(final?.content?.parts).toEqual([
			{
				functionCall: {
					id: "named",
					name: "named_tool",
					args: {},
				},
			},
		]);
	});

	it("mixed text + functionCall content prefers functionCall branch", () => {
		const message = (llm as any).contentToOpenAiMessage({
			role: "model",
			parts: [
				{ text: "ignore me" },
				{
					functionCall: {
						id: "fc1",
						name: "lookup",
						args: { q: "x" },
					},
				},
			],
		});

		expect(message).toEqual({
			role: "assistant",
			tool_calls: [
				{
					id: "fc1",
					type: "function",
					function: {
						name: "lookup",
						arguments: JSON.stringify({ q: "x" }),
					},
				},
			],
		});
	});

	it.each([
		null,
		undefined,
		42,
		"string",
		true,
	])("transformSchemaForOpenAi early-returns non-object %j", (value) => {
		expect((llm as any).transformSchemaForOpenAi(value)).toBe(value);
	});

	it("preprocessRequest with config but undefined contents clears labels only", () => {
		const req = new LlmRequest({
			config: { labels: { env: "test" }, temperature: 0.1 } as any,
		});
		delete (req as any).contents;

		(llm as any).preprocessRequest(req);

		expect((req.config as any).labels).toBeUndefined();
		expect(req.config?.temperature).toBe(0.1);
	});

	it("stream yields partial empty-delta chunk when no finish_reason", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {},
							finish_reason: null,
						},
					],
					usage: undefined,
				};
			})(),
		);

		const responses = await drain(
			new LlmRequest({
				model: "gpt-4o",
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		);

		expect(responses.length).toBeGreaterThan(0);
		expect(responses[0].content).toBeUndefined();
		expect(responses[0].finishReason).toBeUndefined();
	});

	it.each([
		["content_filter", "FINISH_REASON_UNSPECIFIED"],
		[undefined, "FINISH_REASON_UNSPECIFIED"],
		["stop", "STOP"],
		["length", "MAX_TOKENS"],
	] as const)("toAdkFinishReason(%j) → %s", (input, expected) => {
		expect((llm as any).toAdkFinishReason(input)).toBe(expected);
	});

	it("non-stream openAiMessageToLlmResponse maps content_filter finish", () => {
		const response = (llm as any).openAiMessageToLlmResponse(
			{
				message: { role: "assistant", content: "blocked" },
				finish_reason: "content_filter",
			},
			{ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
		);

		expect(response.finishReason).toBe("FINISH_REASON_UNSPECIFIED");
		expect(response.content?.parts?.[0]?.text).toBe("blocked");
	});
});
