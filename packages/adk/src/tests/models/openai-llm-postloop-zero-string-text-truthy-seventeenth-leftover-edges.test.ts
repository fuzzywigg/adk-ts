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
 * Seventeenth leftover: OpenAI post-loop `(text || thoughtText) && usageMetadata`
 * treats accumulated text `"0"` as truthy. #219 pins usage presence vs Google
 * STOP — not zero-string text truthiness on the OpenAI arm.
 */
describe("openai-llm postloop zero-string text truthy seventeenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it('buffered text "0" + usageMetadata → leftover yield with text "0"', async () => {
		const create = vi.fn().mockResolvedValue(
			(async function* () {
				yield {
					choices: [{ delta: { content: "0" }, finish_reason: null, index: 0 }],
					usage: {
						prompt_tokens: 1,
						completion_tokens: 1,
						total_tokens: 2,
					},
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
		const leftover = out.find(
			(r) =>
				!r.partial &&
				!r.finishReason &&
				r.usageMetadata?.totalTokenCount === 2 &&
				r.content?.parts?.[0]?.text === "0",
		);
		expect(leftover).toBeTruthy();
	});

	it("empty buffered text + usageMetadata → no post-loop text leftover", async () => {
		const create = vi.fn().mockResolvedValue(
			(async function* () {
				yield {
					choices: [{ delta: {}, finish_reason: null, index: 0 }],
					usage: {
						prompt_tokens: 1,
						completion_tokens: 0,
						total_tokens: 1,
					},
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
		// Else-branch may still yield the empty chunk with usage; post-loop
		// `(text || thoughtText) && usage` must not emit a text leftover.
		expect(
			out.some(
				(r) =>
					!r.partial &&
					!r.finishReason &&
					Array.isArray(r.content?.parts) &&
					r.content.parts.some((p: any) => p.text != null),
			),
		).toBe(false);
	});

	it('buffered text "0" without usageMetadata → no leftover', async () => {
		const create = vi.fn().mockResolvedValue(
			(async function* () {
				yield {
					choices: [{ delta: { content: "0" }, finish_reason: null, index: 0 }],
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
			out.some(
				(r) =>
					!r.partial && !r.finishReason && r.content?.parts?.[0]?.text === "0",
			),
		).toBe(false);
		expect(out.some((r) => r.partial === true)).toBe(true);
	});
});
