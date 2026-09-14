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

describe("OpenAiLlm system/non-stream sixth leftover edges (post #151)", () => {
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

	async function drain(req: LlmRequest): Promise<LlmResponse[]> {
		const out: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			req,
			false,
		)) {
			out.push(response);
		}
		return out;
	}

	it("system role keeps only parts[0].text and drops later parts", () => {
		const message = (llm as any).contentToOpenAiMessage({
			role: "system",
			parts: [{ text: "first" }, { text: "second" }, { text: "third" }],
		});

		expect(message).toEqual({
			role: "system",
			content: "first",
		});
	});

	it("system role with empty parts array becomes empty content string", () => {
		expect(
			(llm as any).contentToOpenAiMessage({ role: "system", parts: [] }),
		).toEqual({
			role: "system",
			content: "",
		});
	});

	it("system role still wins over later functionCall parts", () => {
		const message = (llm as any).contentToOpenAiMessage({
			role: "system",
			parts: [
				{ text: "sys" },
				{ functionCall: { id: "x", name: "tool", args: {} } },
			],
		});

		expect(message).toEqual({
			role: "system",
			content: "sys",
		});
	});

	it("non-stream openAiMessageToLlmResponse throws on malformed function arguments JSON", () => {
		expect(() =>
			(llm as any).openAiMessageToLlmResponse({
				message: {
					content: null,
					tool_calls: [
						{
							id: "bad",
							type: "function",
							function: { name: "broken", arguments: '{"a":' },
						},
					],
				},
				finish_reason: "tool_calls",
			}),
		).toThrow(SyntaxError);
	});

	it("non-stream generateContentAsyncImpl surfaces malformed tool_call JSON", async () => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: {
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "bad",
								type: "function",
								function: { name: "broken", arguments: '{"a":' },
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
		});

		await expect(
			drain(
				new LlmRequest({
					model: "gpt-4o",
					contents: [{ role: "user", parts: [{ text: "q" }] }],
				}),
			),
		).rejects.toThrow(SyntaxError);
	});

	it("non-stream skips non-function tool_calls while parsing valid siblings", async () => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: {
						role: "assistant",
						content: "hi",
						tool_calls: [
							{
								id: "c",
								type: "custom",
								function: { name: "skip", arguments: "{" },
							},
							{
								id: "f",
								type: "function",
								function: { name: "ok", arguments: '{"z":1}' },
							},
						],
					},
					finish_reason: "stop",
				},
			],
		});

		const responses = await drain(
			new LlmRequest({
				model: "gpt-4o",
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
		);

		expect(responses[0].content?.parts).toEqual([
			{ text: "hi" },
			{ functionCall: { id: "f", name: "ok", args: { z: 1 } } },
		]);
	});
});
