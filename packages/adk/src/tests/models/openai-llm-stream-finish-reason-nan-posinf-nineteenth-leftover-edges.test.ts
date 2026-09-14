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
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip 96457a9 / #248):
 * stream `if (choice.finish_reason)` after eighteenth true/`"true"`/`[]`/
 * `-Infinity`/`-0`. `NaN` skips final yield; `POSITIVE_INFINITY` enters.
 */
describe("openai-llm stream finish-reason nan posinf nineteenth leftover edges", () => {
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

	it("NaN finish_reason skips final STOP yield gate", async () => {
		const responses = await drain([
			{
				choices: [
					{
						delta: { content: "partial" },
						finish_reason: Number.NaN,
						index: 0,
					},
				],
			},
		]);
		const finished = responses.find((r) => r.finishReason != null);
		expect(finished).toBeUndefined();
	});

	it("POSITIVE_INFINITY finish_reason enters final yield gate", async () => {
		const responses = await drain([
			{
				choices: [
					{
						delta: { content: "done" },
						finish_reason: Number.POSITIVE_INFINITY,
						index: 0,
					},
				],
			},
		]);
		const finished = responses.find((r) => r.finishReason != null);
		expect(finished).toBeDefined();
		expect(finished?.content?.parts?.some((p: any) => p.text === "done")).toBe(
			true,
		);
	});
});
