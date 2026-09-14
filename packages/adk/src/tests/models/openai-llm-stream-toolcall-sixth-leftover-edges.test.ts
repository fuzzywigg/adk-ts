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

describe("OpenAiLlm stream/toolcall sixth leftover edges (post #151)", () => {
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

	it("createChunkResponse throws SyntaxError on typed function with partial JSON args", () => {
		expect(() =>
			(llm as any).createChunkResponse({
				tool_calls: [
					{
						index: 0,
						id: "call-bad",
						type: "function",
						function: { name: "partial_tool", arguments: '{"x":' },
					},
				],
			}),
		).toThrow(SyntaxError);
	});

	it("stream aborts when typed function delta forces createChunkResponse JSON.parse", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call-bad",
										type: "function",
										function: { name: "partial_tool", arguments: '{"x":' },
									},
								],
							},
							finish_reason: null,
						},
					],
				};
			})(),
		);

		await expect(drain(baseRequest(), true)).rejects.toThrow(SyntaxError);
	});

	it("tool-call id arriving on a later delta is ignored after first slot creation", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										type: "function",
										function: { name: "late_id_tool", arguments: "{}" },
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
										index: 0,
										id: "call-late",
										type: "function",
										function: { arguments: "" },
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
					id: "",
					name: "late_id_tool",
					args: {},
				},
			},
		]);
	});

	it("mixed text + functionResponse prefers tool-result branch and drops text", () => {
		const message = (llm as any).contentToOpenAiMessage({
			role: "user",
			parts: [
				{ text: "ignore me" },
				{
					functionResponse: {
						id: "r1",
						response: { ok: true },
					},
				},
			],
		});

		expect(message).toEqual({
			role: "tool",
			tool_call_id: "r1",
			content: JSON.stringify({ ok: true }),
		});
	});

	it("functionResponse without id/response defaults to empty tool_call_id and {}", () => {
		const message = (llm as any).contentToOpenAiMessage({
			role: "user",
			parts: [{ text: "also ignored" }, { functionResponse: {} }],
		});

		expect(message).toEqual({
			role: "tool",
			tool_call_id: "",
			content: "{}",
		});
	});

	it("omitting type still allows accumulate/finish to parse concatenated partial args", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call-ok",
										function: { name: "concat", arguments: '{"a":' },
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
										index: 0,
										function: { arguments: "1}" },
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
			{ functionCall: { id: "call-ok", name: "concat", args: { a: 1 } } },
		]);
	});
});
