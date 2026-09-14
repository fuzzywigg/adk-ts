import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleLlm } from "../../models/google-llm";

vi.mock("@google/genai", () => ({
	GoogleGenAI: vi.fn(function (this: any) {
		this.models = {
			generateContent: vi.fn(),
			generateContentStream: vi.fn(),
		};
	}),
	FinishReason: { STOP: "STOP", MAX_TOKENS: "MAX_TOKENS" },
}));

describe("GoogleLlm leftover edges (TOKENMAXX post #124)", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.GOOGLE_API_KEY = "test-key";
		delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("convertContents keeps empty parts arrays (truthy) without falling back to content", () => {
		const llm = new GoogleLlm();
		const converted = (llm as any).convertContents([
			{ role: "user", parts: [], content: "ignored" },
			{ role: "assistant", parts: [{ text: "ok" }] },
		]);
		expect(converted).toEqual([
			{ role: "user", parts: [] },
			{ role: "model", parts: [{ text: "ok" }] },
		]);
	});

	it("convertContents falls back to empty text when parts and content are both missing", () => {
		const llm = new GoogleLlm();
		const converted = (llm as any).convertContents([{ role: "user" }]);
		expect(converted).toEqual([{ role: "user", parts: [{ text: "" }] }]);
	});

	it("removeDisplayNameIfPresent is a no-op when displayName is absent", () => {
		const llm = new GoogleLlm();
		const data = { mimeType: "image/png", data: "x" };
		(llm as any).removeDisplayNameIfPresent(data);
		expect(data).toEqual({ mimeType: "image/png", data: "x" });
	});

	it("hasInlineData is false for empty candidates and missing parts", () => {
		const llm = new GoogleLlm();
		expect((llm as any).hasInlineData({ candidates: [] })).toBe(false);
		expect(
			(llm as any).hasInlineData({
				candidates: [{ content: {} }],
			}),
		).toBe(false);
		expect(
			(llm as any).hasInlineData({
				candidates: [{ content: { parts: [{ text: "no-inline" }] } }],
			}),
		).toBe(false);
	});

	it("apiClient and liveApiClient reuse cached instances on second access", () => {
		const llm = new GoogleLlm();
		const first = llm.apiClient;
		const second = llm.apiClient;
		expect(second).toBe(first);

		const liveFirst = llm.liveApiClient;
		const liveSecond = llm.liveApiClient;
		expect(liveSecond).toBe(liveFirst);
	});
});
