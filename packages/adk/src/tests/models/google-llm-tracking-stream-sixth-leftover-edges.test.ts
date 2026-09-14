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

describe("GoogleLlm tracking/stream sixth leftover edges (post #150)", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let mockGenerateContentStream: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.GOOGLE_API_KEY = "matrix-key";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
		delete process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID;
		vi.clearAllMocks();
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
	});

	async function drainStream(chunks: unknown[]): Promise<LlmResponse[]> {
		mockGenerateContentStream.mockResolvedValue(
			(async function* () {
				for (const chunk of chunks) {
					yield chunk;
				}
			})(),
		);
		const llm = new GoogleLlm();
		const responses: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		)) {
			responses.push(response);
		}
		return responses;
	}

	it("trackingHeaders memoizes first snapshot across later GOOGLE_CLOUD_AGENT_ENGINE_ID mutation", () => {
		const llm = new GoogleLlm();
		const first = llm.trackingHeaders;
		expect(first["x-goog-api-client"]).not.toMatch(/\+remote_reasoning_engine/);

		process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID = "engine-1";
		const second = llm.trackingHeaders;
		expect(second).toBe(first);
		expect(second["x-goog-api-client"]).not.toMatch(
			/\+remote_reasoning_engine/,
		);

		(llm as any)._trackingHeaders = undefined;
		const third = llm.trackingHeaders;
		expect(third).not.toBe(first);
		expect(third["x-goog-api-client"]).toMatch(/\+remote_reasoning_engine/);
	});

	it("empty candidates last chunk merges mid-loop then fails final STOP gate", async () => {
		const responses = await drainStream([
			{
				candidates: [
					{
						content: {
							role: "model",
							parts: [{ text: "keep" }],
						},
					},
				],
			},
			{
				candidates: [],
			},
		]);

		const partials = responses.filter((r) => r.partial === true);
		expect(partials.some((r) => r.content?.parts?.[0]?.text === "keep")).toBe(
			true,
		);

		const mergedKeep = responses.filter(
			(r) =>
				r.partial !== true &&
				!r.errorCode &&
				r.content?.parts?.length === 1 &&
				r.content.parts[0].text === "keep",
		);
		expect(mergedKeep).toHaveLength(1);

		const last = responses[responses.length - 1];
		expect(last.errorCode).toBe("UNKNOWN_ERROR");
		expect(last.errorMessage).toBe("Unknown error.");

		const duplicateFinalLeftover = responses.filter(
			(r) =>
				r.partial !== true &&
				!r.errorCode &&
				r.content?.parts?.some((p: any) => p.text === "keep"),
		);
		expect(duplicateFinalLeftover).toHaveLength(1);
	});

	it("candidates null last chunk is falsy so final STOP gate is skipped after merge", async () => {
		const responses = await drainStream([
			{
				candidates: [
					{
						content: {
							role: "model",
							parts: [{ text: "held" }],
						},
					},
				],
			},
			{
				candidates: null,
			},
		]);

		const merged = responses.filter(
			(r) =>
				r.partial !== true &&
				!r.errorCode &&
				r.content?.parts?.some((p: any) => p.text === "held"),
		);
		expect(merged).toHaveLength(1);
		expect(responses[responses.length - 1].errorCode).toBe("UNKNOWN_ERROR");
	});

	it("STOP finish after inline-skipped buffer merges mid-loop then post-loop gate is a no-op", async () => {
		const responses = await drainStream([
			{
				candidates: [
					{
						content: {
							role: "model",
							parts: [{ text: "held" }],
						},
					},
				],
			},
			{
				candidates: [
					{
						content: {
							role: "model",
							parts: [{ inlineData: { mimeType: "image/png", data: "y" } }],
						},
					},
				],
			},
			{
				candidates: [{ finishReason: "STOP" }],
			},
		]);

		const mergedHeld = responses.filter(
			(r) =>
				r.partial !== true &&
				!r.errorCode &&
				r.content?.parts?.some((p: any) => p.text === "held"),
		);
		expect(mergedHeld).toHaveLength(1);
		expect(mergedHeld[0].content?.parts).toEqual([{ text: "held" }]);

		const stopError = responses.filter((r) => r.errorCode === "STOP");
		expect(stopError).toHaveLength(1);
	});

	it("same-chunk text + STOP leaves buffer for post-loop leftover yield", async () => {
		const responses = await drainStream([
			{
				candidates: [
					{
						content: {
							role: "model",
							parts: [{ text: "final-bit" }],
						},
						finishReason: "STOP",
					},
				],
			},
		]);

		const partials = responses.filter((r) => r.partial === true);
		expect(partials).toHaveLength(1);
		expect(partials[0].content?.parts).toEqual([{ text: "final-bit" }]);

		const leftovers = responses.filter(
			(r) =>
				r.partial !== true &&
				!r.errorCode &&
				r.content?.parts?.some((p: any) => p.text === "final-bit"),
		);
		expect(leftovers).toHaveLength(1);
	});

	it("empty candidates after inline-skipped buffer merges once without STOP leftover duplicate", async () => {
		const responses = await drainStream([
			{
				candidates: [
					{
						content: {
							role: "model",
							parts: [{ text: "buffered" }],
						},
					},
				],
			},
			{
				candidates: [
					{
						content: {
							role: "model",
							parts: [{ inlineData: { mimeType: "image/png", data: "x" } }],
						},
					},
				],
			},
			{
				candidates: [],
			},
		]);

		const mergedBuffered = responses.filter(
			(r) =>
				r.partial !== true &&
				!r.errorCode &&
				r.content?.parts?.some((p: any) => p.text === "buffered"),
		);
		expect(mergedBuffered).toHaveLength(1);
		expect(responses[responses.length - 1].errorCode).toBe("UNKNOWN_ERROR");
	});
});
