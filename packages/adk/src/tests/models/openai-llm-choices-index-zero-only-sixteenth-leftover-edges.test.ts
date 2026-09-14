import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../models/llm-request";
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
 * Sixteenth leftover: stream/non-stream only read `choices[0]`. Content only
 * on choices[1] is never observed; empty choices yields nothing. Fifteenth
 * covered parts[0] text buffering, not choices index.
 */
describe("openai-llm choices index-zero only sixteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it("non-stream ignores message sitting only on choices[1]", async () => {
		const create = vi.fn().mockResolvedValue({
			choices: [
				undefined,
				{ message: { content: "late" }, finish_reason: "stop" },
			],
		});
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create } },
		}));
		const llm = new OpenAiLlm("gpt-4o-mini");
		const out: any[] = [];
		for await (const resp of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			false,
		)) {
			out.push(resp);
		}
		expect(out).toHaveLength(0);
	});

	it("non-stream empty choices yields nothing", async () => {
		const create = vi.fn().mockResolvedValue({ choices: [] });
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create } },
		}));
		const llm = new OpenAiLlm("gpt-4o-mini");
		const out: any[] = [];
		for await (const resp of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			false,
		)) {
			out.push(resp);
		}
		expect(out).toHaveLength(0);
	});

	it("stream skips chunks whose choices[0] is missing (choices[1]-only)", async () => {
		const create = vi.fn().mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						undefined,
						{ delta: { content: "late" }, finish_reason: null, index: 1 },
					],
				};
				yield {
					choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
				};
			})(),
		);
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create } },
		}));
		const llm = new OpenAiLlm("gpt-4o-mini");
		const out: any[] = [];
		for await (const resp of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		)) {
			out.push(resp);
		}
		expect(
			out.every((r) => !r.content?.parts?.some((p: any) => p.text === "late")),
		).toBe(true);
	});
});
