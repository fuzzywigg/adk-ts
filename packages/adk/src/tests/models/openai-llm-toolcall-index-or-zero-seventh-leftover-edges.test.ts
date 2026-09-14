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

describe("OpenAiLlm toolCall.index || 0 seventh leftover (post #161)", () => {
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
		undefined,
		null,
		0,
		false,
		"" as unknown as number,
	])("falsy index %j coalesces into slot 0 and concatenates with index:0 sibling", async (falsyIndex) => {
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
										index: falsyIndex,
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

	it("omitted index merges into existing slot 0 (same || 0 trap)", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call-omit",
										function: { name: "merge", arguments: "{" },
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
										function: { arguments: '"x":2}' },
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
			{ functionCall: { id: "call-omit", name: "merge", args: { x: 2 } } },
		]);
	});

	it("positive index 1 stays distinct from falsy-index slot 0", async () => {
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
										index: 1,
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
			{ functionCall: { id: "call-b", name: "b", args: {} } },
		]);
	});
});
