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
 * Twentieth leftover residual deepen (complements #282 object-true/one/infinity):
 * stream `if (choice.finish_reason)` — boxed falsy `Object(false)` /
 * `Object(0)` / `Object(NaN)` enter final yield (primitive false/0/NaN skip).
 */
describe("openai-llm stream finish-reason object-false/zero/nan twentieth residual deepen", () => {
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
		{ label: "Object(false)", finish_reason: Object(false) },
		{ label: "Object(0)", finish_reason: Object(0) },
		{ label: "Object(NaN)", finish_reason: Object(Number.NaN) },
	])("$label finish_reason enters final yield gate", async ({
		finish_reason,
	}) => {
		const responses = await drain([
			{
				choices: [
					{
						delta: { content: "done" },
						finish_reason,
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
