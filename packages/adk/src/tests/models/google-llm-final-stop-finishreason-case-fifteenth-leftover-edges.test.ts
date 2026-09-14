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
 * Fifteenth leftover: post-loop final merge requires exact
 * `finishReason === FinishReason.STOP` ("STOP"). Case near-misses leave the
 * buffered text without that extra non-partial yield.
 */
describe("google-llm final STOP finishReason case fifteenth leftover edges", () => {
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

	async function collect(finishReason: string) {
		mockGenerateContentStream.mockResolvedValue(
			(async function* () {
				yield {
					candidates: [
						{
							content: {
								role: "model",
								parts: [{ text: "hello" }],
							},
							finishReason,
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

	function finalMergeCount(out: any[]) {
		return out.filter(
			(r) =>
				r.partial !== true &&
				r.content?.parts?.length === 1 &&
				r.content.parts[0].text === "hello",
		).length;
	}

	it('exact "STOP" emits post-loop non-partial merge of buffered text', async () => {
		const out = await collect("STOP");
		expect(out.some((r) => r.partial === true)).toBe(true);
		expect(finalMergeCount(out)).toBe(1);
	});

	it.each([
		{ label: "lowercase stop", finishReason: "stop" },
		{ label: "Stop titlecase", finishReason: "Stop" },
		{ label: "MAX_TOKENS", finishReason: "MAX_TOKENS" },
	])("finishReason $label skips post-loop STOP merge", async ({
		finishReason,
	}) => {
		const out = await collect(finishReason);
		expect(out.some((r) => r.partial === true)).toBe(true);
		expect(finalMergeCount(out)).toBe(0);
	});
});
