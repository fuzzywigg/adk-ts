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

describe("GoogleLlm stream matrix edges (overnight TOKENMAXX post #142)", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let mockGenerateContentStream: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.GOOGLE_API_KEY = "matrix-key";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
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

	it.each([
		{
			label: "thought-only then STOP",
			chunks: [
				{
					candidates: [
						{
							content: {
								role: "model",
								parts: [{ text: "plan", thought: true }],
							},
						},
					],
				},
				{
					candidates: [{ finishReason: "STOP" }],
				},
			],
			expectMergedThought: "plan",
			expectMergedText: undefined as string | undefined,
		},
		{
			label: "text-only then STOP",
			chunks: [
				{
					candidates: [
						{
							content: {
								role: "model",
								parts: [{ text: "answer" }],
							},
						},
					],
				},
				{
					candidates: [{ finishReason: "STOP" }],
				},
			],
			expectMergedThought: undefined,
			expectMergedText: "answer",
		},
		{
			label: "interleaved thought then text then STOP",
			chunks: [
				{
					candidates: [
						{
							content: {
								role: "model",
								parts: [{ text: "think-", thought: true }],
							},
						},
					],
				},
				{
					candidates: [
						{
							content: {
								role: "model",
								parts: [{ text: "more", thought: true }],
							},
						},
					],
				},
				{
					candidates: [
						{
							content: {
								role: "model",
								parts: [{ text: "out" }],
							},
						},
					],
				},
				{
					candidates: [{ finishReason: "STOP" }],
				},
			],
			expectMergedThought: "think-more",
			expectMergedText: "out",
		},
	])("$label yields non-partial merge with expected buffers", async ({
		chunks,
		expectMergedThought,
		expectMergedText,
	}) => {
		const responses = await drainStream(chunks);
		const merged = responses.find(
			(r) =>
				r.partial !== true &&
				!r.errorCode &&
				(r.content?.parts?.length || 0) > 0,
		);
		expect(merged).toBeDefined();
		const thought = merged?.content?.parts?.find(
			(p: any) => p.thought === true,
		);
		const text = merged?.content?.parts?.find((p: any) => p.text && !p.thought);
		if (expectMergedThought) {
			expect(thought?.text).toBe(expectMergedThought);
		} else {
			expect(thought).toBeUndefined();
		}
		if (expectMergedText) {
			expect(text?.text).toBe(expectMergedText);
		} else {
			expect(text).toBeUndefined();
		}
	});

	it.each([
		{ finishReason: "MAX_TOKENS" },
		{ finishReason: "FINISH_REASON_UNSPECIFIED" },
		{ finishReason: "SAFETY" },
	])("does not final-merge leftover buffers when finishReason is $finishReason", async ({
		finishReason,
	}) => {
		const responses = await drainStream([
			{
				candidates: [
					{
						content: { role: "model", parts: [{ text: "partial" }] },
					},
				],
			},
			{
				candidates: [{ finishReason }],
			},
		]);

		const finalMerge = responses.filter(
			(r) =>
				r.partial !== true &&
				!r.errorCode &&
				r.content?.parts?.some((p: any) => p.text === "partial"),
		);
		// Mid-stream merge may still fire on the no-content chunk; final STOP-only
		// leftover yield must not add another copy after the loop.
		const stopOnlyFinals = responses.filter(
			(r) =>
				r.partial !== true &&
				!r.errorCode &&
				r.content?.role === "model" &&
				r.content?.parts?.every((p: any) => typeof p.text === "string"),
		);
		expect(stopOnlyFinals.length).toBeLessThanOrEqual(1);
		expect(finalMerge.length).toBeLessThanOrEqual(1);
	});

	it("falls back to constructor model when request model is undefined", async () => {
		mockGenerateContentStream.mockResolvedValue(
			(async function* () {
				yield {
					candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }],
				};
			})(),
		);

		const llm = new GoogleLlm("gemini-custom");
		const req = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		});
		delete (req as { model?: string }).model;

		for await (const _ of (llm as any).generateContentAsyncImpl(req, true)) {
			/* drain */
		}

		expect(mockGenerateContentStream).toHaveBeenCalledWith(
			expect.objectContaining({ model: "gemini-custom" }),
		);
	});

	it("GEMINI_API preprocess clears labels and nulls displayName on inline/file data", async () => {
		const mockGenerateContent = vi.fn().mockResolvedValue({
			candidates: [{ content: { parts: [{ text: "ok" }] } }],
		});
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: mockGenerateContent,
					generateContentStream: mockGenerateContentStream,
				},
			}),
		);

		const llm = new GoogleLlm();
		const inline = {
			mimeType: "image/png",
			data: "abc",
			displayName: "shot.png",
		};
		const file = {
			fileUri: "gs://bucket/f",
			mimeType: "text/plain",
			displayName: "f.txt",
		};
		const req = new LlmRequest({
			config: { labels: { env: "test" } } as any,
			contents: [
				{
					role: "user",
					parts: [{ inlineData: inline }, { fileData: file }],
				},
				{ role: "user" },
			],
		});

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect((req.config as any).labels).toBeUndefined();
		expect(inline.displayName).toBeNull();
		expect(file.displayName).toBeNull();
	});

	it("VERTEX_AI preprocess keeps labels and displayName", async () => {
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
		process.env.GOOGLE_CLOUD_PROJECT = "proj";
		process.env.GOOGLE_CLOUD_LOCATION = "loc";

		const mockGenerateContent = vi.fn().mockResolvedValue({
			candidates: [{ content: { parts: [{ text: "ok" }] } }],
		});
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: mockGenerateContent,
					generateContentStream: mockGenerateContentStream,
				},
			}),
		);

		const llm = new GoogleLlm();
		const inline = {
			mimeType: "image/png",
			data: "abc",
			displayName: "shot.png",
		};
		const req = new LlmRequest({
			config: { labels: { env: "prod" } } as any,
			contents: [
				{
					role: "user",
					parts: [{ inlineData: inline }],
				},
			],
		});

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect((req.config as any).labels).toEqual({ env: "prod" });
		expect(inline.displayName).toBe("shot.png");
	});

	it.each([
		{ useVertex: false, expectedVersion: "v1alpha" },
		{ useVertex: true, expectedVersion: "v1beta1" },
	])("liveApiVersion is $expectedVersion when vertex=$useVertex", ({
		useVertex,
		expectedVersion,
	}) => {
		process.env.GOOGLE_GENAI_USE_VERTEXAI = useVertex ? "true" : "false";
		if (useVertex) {
			process.env.GOOGLE_CLOUD_PROJECT = "proj";
			process.env.GOOGLE_CLOUD_LOCATION = "loc";
		} else {
			process.env.GOOGLE_API_KEY = "k";
		}
		const llm = new GoogleLlm();
		expect(llm.liveApiVersion).toBe(expectedVersion);
	});
});
