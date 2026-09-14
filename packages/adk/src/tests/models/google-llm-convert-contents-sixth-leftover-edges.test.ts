import { GoogleGenAI } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleLlm } from "../../models/google-llm";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";

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

describe("GoogleLlm convertContents sixth leftover edges (post #150)", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let mockGenerateContent: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.GOOGLE_API_KEY = "convert-key";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
		vi.clearAllMocks();
		mockGenerateContent = vi.fn().mockResolvedValue({
			candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }],
		});
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: mockGenerateContent,
					generateContentStream: vi.fn(),
				},
			}),
		);
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("convertContents maps assistant role to model", () => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([
				{ role: "assistant", parts: [{ text: "prior" }] },
				{ role: "user", parts: [{ text: "q" }] },
			]),
		).toEqual([
			{ role: "model", parts: [{ text: "prior" }] },
			{ role: "user", parts: [{ text: "q" }] },
		]);
	});

	it("convertContents falls back to content string when parts are missing", () => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([
				{ role: "user", content: "legacy-body" },
				{ role: "model" },
			]),
		).toEqual([
			{ role: "user", parts: [{ text: "legacy-body" }] },
			{ role: "model", parts: [{ text: "" }] },
		]);
	});

	it("convertContents prefers explicit parts over legacy content string", () => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([
				{
					role: "user",
					parts: [{ text: "parts-win" }],
					content: "legacy-ignored",
				},
			]),
		).toEqual([{ role: "user", parts: [{ text: "parts-win" }] }]);
	});

	it("generateContentAsyncImpl forwards convertContents role remapping to the API", async () => {
		const llm = new GoogleLlm();
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [
					{ role: "assistant", parts: [{ text: "prior" }] },
					{ role: "user", parts: [{ text: "next" }] },
				],
			}),
			false,
		)) {
			/* drain */
		}

		expect(mockGenerateContent).toHaveBeenCalledWith(
			expect.objectContaining({
				contents: [
					{ role: "model", parts: [{ text: "prior" }] },
					{ role: "user", parts: [{ text: "next" }] },
				],
			}),
		);
	});

	it("generateContentAsyncImpl uses legacy content fallback when parts are absent", async () => {
		const llm = new GoogleLlm();
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", content: "from-content" } as any],
			}),
			false,
		)) {
			/* drain */
		}

		expect(mockGenerateContent).toHaveBeenCalledWith(
			expect.objectContaining({
				contents: [{ role: "user", parts: [{ text: "from-content" }] }],
			}),
		);
	});

	it("empty contents array still calls generateContent with empty converted list", async () => {
		const llm = new GoogleLlm();
		const responses: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			new LlmRequest({ contents: [] }),
			false,
		)) {
			responses.push(response);
		}

		expect(mockGenerateContent).toHaveBeenCalledWith(
			expect.objectContaining({
				contents: [],
			}),
		);
		expect(responses).toHaveLength(1);
	});
});
