import { GoogleGenAI } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleLlm } from "../../models/google-llm";
import { LlmRequest } from "../../models/llm-request";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
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
 * Fourteenth leftover: stream branch `if ((part0 as any).thought)` — truthy
 * thought (incl. " " / "0") accumulates as thoughtText; falsy "" / 0 / false
 * go to the regular text path.
 */
describe("google-llm thought truthiness fourteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let mockGenerateContentStream: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.GOOGLE_API_KEY = "test-key";
		delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
		mockGenerateContentStream = vi.fn();
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: vi.fn(),
					generateContentStream: mockGenerateContentStream,
				},
			}),
		);
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	async function collectStream(thought: unknown) {
		mockGenerateContentStream.mockResolvedValue(
			(async function* () {
				yield {
					candidates: [
						{
							content: {
								role: "model",
								parts: [{ text: "chunk", thought }],
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
		return out;
	}

	it.each([
		{ label: "true", thought: true },
		{ label: "whitespace", thought: " " },
		{ label: "zero string", thought: "0" },
	])("truthy thought=$label accumulates as thought part", async ({
		thought,
	}) => {
		const responses = await collectStream(thought);
		const merged = responses.find(
			(r) =>
				r.partial !== true &&
				r.content?.parts?.some((p: any) => p.thought === true),
		);
		expect(merged?.content?.parts).toEqual(
			expect.arrayContaining([{ text: "chunk", thought: true }]),
		);
	});

	it.each([
		{ label: "empty string", thought: "" },
		{ label: "0", thought: 0 },
		{ label: "false", thought: false },
	])("falsy thought=$label accumulates as regular text", async ({
		thought,
	}) => {
		const responses = await collectStream(thought);
		const merged = responses.find(
			(r) =>
				r.partial !== true &&
				r.content?.parts?.some((p: any) => p.text === "chunk" && !p.thought),
		);
		expect(merged?.content?.parts).toEqual(
			expect.arrayContaining([{ text: "chunk" }]),
		);
		expect(merged?.content?.parts?.some((p: any) => p.thought === true)).toBe(
			false,
		);
	});
});
