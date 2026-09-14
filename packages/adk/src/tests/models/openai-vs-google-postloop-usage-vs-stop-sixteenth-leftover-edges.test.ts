import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleLlm } from "../../models/google-llm";
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

vi.mock("@google/genai", () => ({
	GoogleGenAI: vi.fn(),
	FinishReason: {
		STOP: "STOP",
		MAX_TOKENS: "MAX_TOKENS",
		FINISH_REASON_UNSPECIFIED: "FINISH_REASON_UNSPECIFIED",
	},
}));

/**
 * Sixteenth leftover: OpenAI post-loop gates on `(text || thoughtText) &&
 * usageMetadata`; Google gates on exact `finishReason === STOP`. Fifteenth
 * pinned Google STOP case only — usage truthiness residual remains.
 */
describe("openai vs google postloop usage vs stop sixteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		process.env.GOOGLE_API_KEY = "test-key";
		delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it("OpenAI post-loop emits leftover when buffered text and usageMetadata", async () => {
		const create = vi.fn().mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{ delta: { content: "solo" }, finish_reason: null, index: 0 },
					],
					usage: {
						prompt_tokens: 1,
						completion_tokens: 2,
						total_tokens: 3,
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
				r.usageMetadata?.totalTokenCount === 3 &&
				r.content?.parts?.[0]?.text === "solo",
		);
		expect(leftover).toBeTruthy();
	});

	it("OpenAI post-loop skips when buffered text but usageMetadata absent", async () => {
		const create = vi.fn().mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{ delta: { content: "solo" }, finish_reason: null, index: 0 },
					],
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
					!r.partial &&
					!r.finishReason &&
					r.content?.parts?.[0]?.text === "solo",
			),
		).toBe(false);
		expect(out.some((r) => r.partial === true)).toBe(true);
	});

	it('Google post-loop still keys off exact "STOP", not usageMetadata', async () => {
		const mockStream = vi.fn().mockResolvedValue(
			(async function* () {
				yield {
					candidates: [
						{
							content: { role: "model", parts: [{ text: "hello" }] },
							finishReason: "MAX_TOKENS",
						},
					],
					usageMetadata: {
						promptTokenCount: 1,
						candidatesTokenCount: 2,
						totalTokenCount: 3,
					},
				};
			})(),
		);
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: vi.fn(),
					generateContentStream: mockStream,
				},
			}),
		);
		const llm = new GoogleLlm();
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
			out.filter(
				(r) =>
					r.partial !== true &&
					r.content?.parts?.length === 1 &&
					r.content.parts[0].text === "hello",
			),
		).toHaveLength(0);
	});
});
