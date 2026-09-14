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
 * Fifteenth leftover: stream accumulate only reads `parts?.[0]?.text`.
 * Text present only on parts[1] is never buffered into thoughtText/text —
 * mid-stream merge / final merge never see "late".
 */
describe("providers stream parts index-zero only fifteenth leftover edges", () => {
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

	it("OpenAI buffer never gains parts[1]-only text", async () => {
		const create = vi.fn().mockResolvedValue(
			(async function* () {
				yield {
					choices: [{ delta: { content: null }, index: 0 }],
				};
				yield {
					choices: [
						{
							delta: {},
							finish_reason: "stop",
							index: 0,
						},
					],
				};
			})(),
		);
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create } },
		}));

		const llm = new OpenAiLlm("gpt-4o-mini");
		const responses = [
			{
				content: {
					role: "model",
					parts: [{ text: undefined }, { text: "late" }],
				},
			},
			{
				content: { role: "model", parts: [] },
			},
		];
		let call = 0;
		vi.spyOn(llm as any, "createChunkResponse").mockImplementation(() => {
			return responses[call++] ?? { content: undefined };
		});

		const out: any[] = [];
		for await (const resp of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		)) {
			out.push(resp);
		}

		const bufferedMerges = out.filter(
			(r) =>
				r.content?.parts?.length === 1 &&
				r.content.parts[0].text === "late" &&
				r.partial !== true,
		);
		expect(bufferedMerges).toHaveLength(0);
		expect(
			out.some(
				(r) =>
					Array.isArray(r.content?.parts) &&
					r.content.parts[0]?.text === undefined &&
					r.content.parts[1]?.text === "late",
			),
		).toBe(true);
	});

	it("Google buffer never gains parts[1]-only text across STOP", async () => {
		const stream = vi.fn().mockResolvedValue(
			(async function* () {
				yield {
					candidates: [
						{
							content: {
								role: "model",
								parts: [{}, { text: "late" }],
							},
						},
					],
				};
				yield {
					candidates: [
						{
							content: { role: "model", parts: [] },
							finishReason: "STOP",
						},
					],
				};
			})(),
		);
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: vi.fn(),
					generateContentStream: stream,
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
			out.some(
				(r) =>
					r.partial !== true &&
					r.content?.parts?.length === 1 &&
					r.content.parts[0].text === "late",
			),
		).toBe(false);
		expect(out.some((r) => r.content?.parts?.[1]?.text === "late")).toBe(true);
	});
});
