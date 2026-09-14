import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import type { LlmResponse } from "../../models/llm-response";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: { completions: { create: vi.fn() } },
	})),
}));

/**
 * Seventeenth leftover: stream path `if (choice.finish_reason)` gates the final
 * yield. Falsy finish_reason skips final STOP yield; truthy near-miss enters.
 * Distinct from BaseLlm `finish_reason || "unknown"` sixteenth leftover.
 */
describe("openai-llm stream finish-reason truthy gate seventeenth leftover edges", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;
	let mockCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		mockCreate = vi.fn();
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create: mockCreate } },
		}));
		llm = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	async function drain(streamChunks: any[]): Promise<LlmResponse[]> {
		mockCreate.mockResolvedValue(
			(async function* () {
				for (const chunk of streamChunks) {
					yield chunk;
				}
			})(),
		);
		const out: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		)) {
			out.push(response);
		}
		return out;
	}

	it.each([
		{ label: "empty string", finish_reason: "" },
		{ label: "0", finish_reason: 0 },
		{ label: "false", finish_reason: false },
		{ label: "null", finish_reason: null },
	])("falsy finish_reason ($label) skips final STOP yield", async ({
		finish_reason,
	}) => {
		const responses = await drain([
			{
				choices: [{ delta: { content: "partial" }, finish_reason, index: 0 }],
			},
		]);
		expect(responses.some((r) => r.finishReason != null)).toBe(false);
		expect(
			responses.some((r) =>
				r.content?.parts?.some((p: any) => p.text === "partial"),
			),
		).toBe(true);
	});

	it.each([
		{ label: "zero string", finish_reason: "0" },
		{ label: "whitespace", finish_reason: " " },
		{ label: "stop", finish_reason: "stop" },
	])("truthy finish_reason ($label) enters final yield gate", async ({
		finish_reason,
	}) => {
		const responses = await drain([
			{
				choices: [{ delta: { content: "done" }, finish_reason, index: 0 }],
			},
		]);
		const finished = responses.find((r) => r.finishReason != null);
		expect(finished).toBeDefined();
		expect(finished?.content?.parts?.some((p: any) => p.text === "done")).toBe(
			true,
		);
	});
});
