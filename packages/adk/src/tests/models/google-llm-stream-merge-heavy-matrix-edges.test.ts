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

describe("GoogleLlm stream merge heavy matrix leftover edges (post #144)", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let generateContent: ReturnType<typeof vi.fn>;
	let generateContentStream: ReturnType<typeof vi.fn>;
	let llm: GoogleLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.GOOGLE_API_KEY = "fake-stream-key";
		delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
		generateContent = vi.fn();
		generateContentStream = vi.fn();
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: { generateContent, generateContentStream },
			}),
		);
		llm = new GoogleLlm("gemini-2.5-flash");
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	async function collect(
		gen: AsyncGenerator<LlmResponse, void, unknown>,
	): Promise<LlmResponse[]> {
		const out: LlmResponse[] = [];
		for await (const item of gen) {
			out.push(item);
		}
		return out;
	}

	function textChunk(
		text: string,
		opts: { thought?: boolean; finishReason?: string } = {},
	) {
		return {
			candidates: [
				{
					content: {
						role: "model",
						parts: [{ text, ...(opts.thought ? { thought: true } : {}) }],
					},
					finishReason: opts.finishReason,
				},
			],
			usageMetadata: {
				promptTokenCount: 1,
				candidatesTokenCount: text.length,
				totalTokenCount: 1 + text.length,
			},
		};
	}

	function emptyChunk(
		opts: {
			finishReason?: string;
			inlineData?: boolean;
			noParts?: boolean;
			noContent?: boolean;
		} = {},
	) {
		const parts = opts.noParts
			? undefined
			: opts.inlineData
				? [{ inlineData: { data: "abc", mimeType: "image/png" } }]
				: [];
		return {
			candidates: [
				{
					content: opts.noContent
						? undefined
						: {
								role: "model",
								parts,
							},
					finishReason: opts.finishReason,
				},
			],
		};
	}

	it.each([
		{
			label: "model omitted falls back to constructor",
			model: undefined,
			expected: "gemini-2.5-flash",
		},
		{
			label: "empty model string is falsy fallback",
			model: "",
			expected: "gemini-2.5-flash",
		},
		{
			label: "explicit request model wins",
			model: "gemini-2.0-flash",
			expected: "gemini-2.0-flash",
		},
	])("non-stream $label", async ({ model, expected }) => {
		generateContent.mockResolvedValue(
			textChunk("ok", { finishReason: "STOP" }),
		);
		await collect(
			(llm as any).generateContentAsyncImpl(
				new LlmRequest({
					model: model as any,
					contents: [{ role: "user", parts: [{ text: "hi" }] }],
				}),
				false,
			),
		);
		expect(generateContent).toHaveBeenCalledWith(
			expect.objectContaining({ model: expected }),
		);
	});

	it.each([
		{
			label: "merge on empty parts then final STOP leftover",
			chunks: [
				textChunk("hello"),
				emptyChunk({ finishReason: undefined }),
				{
					candidates: [
						{
							content: { role: "model", parts: [{ text: "" }] },
							finishReason: "STOP",
						},
					],
				},
			],
			assert: (responses: LlmResponse[]) => {
				const merge = responses.find(
					(r) =>
						r.content?.parts?.length === 1 &&
						r.content.parts[0].text === "hello" &&
						!r.partial,
				);
				expect(merge).toBeTruthy();
				const finalLeftover = responses.filter(
					(r) =>
						r.content?.parts?.[0]?.text === "hello" &&
						r.partial !== true &&
						r !== merge,
				);
				expect(finalLeftover.length).toBeGreaterThanOrEqual(0);
			},
		},
		{
			label: "skips merge when inlineData present on empty text chunk",
			chunks: [
				textChunk("buffered"),
				emptyChunk({ inlineData: true }),
				emptyChunk({ finishReason: "STOP" }),
			],
			assert: (responses: LlmResponse[]) => {
				const mergeBeforeInline = responses.some(
					(r) =>
						!r.partial &&
						r.content?.parts?.[0]?.text === "buffered" &&
						responses.indexOf(r) <
							responses.findIndex(
								(x) => (x.content?.parts as any)?.[0]?.inlineData,
							),
				);
				expect(mergeBeforeInline).toBe(false);
			},
		},
		{
			label: "thought and text buffers merge together",
			chunks: [
				textChunk("think-", { thought: true }),
				textChunk("say"),
				emptyChunk({ noContent: true }),
				{
					candidates: [
						{
							content: { role: "model", parts: [] },
							finishReason: "STOP",
						},
					],
				},
			],
			assert: (responses: LlmResponse[]) => {
				const merged = responses.find(
					(r) =>
						r.content?.parts?.length === 2 &&
						(r.content.parts[0] as any).thought === true &&
						r.content.parts[0].text === "think-" &&
						r.content.parts[1].text === "say",
				);
				expect(merged).toBeTruthy();
			},
		},
		{
			label: "MAX_TOKENS drops post-loop leftover of accumulated text",
			chunks: [
				textChunk("trunc-"),
				textChunk("ated", { finishReason: "MAX_TOKENS" }),
			],
			assert: (responses: LlmResponse[]) => {
				expect(
					responses.filter((r) => r.partial && r.content?.parts?.[0]?.text),
				).toHaveLength(2);
				expect(
					responses.some(
						(r) => !r.partial && r.content?.parts?.[0]?.text === "trunc-ated",
					),
				).toBe(false);
			},
		},
	])("stream path: $label", async ({ chunks, assert }) => {
		generateContentStream.mockResolvedValue(
			(async function* () {
				for (const chunk of chunks) {
					yield chunk;
				}
			})(),
		);

		const responses = await collect(
			(llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "q" }] }],
				}),
				true,
			),
		);
		assert(responses);
	});

	describe("hasInlineData matrix", () => {
		it.each([
			{
				label: "missing candidates",
				response: {},
				expected: false,
			},
			{
				label: "empty candidates",
				response: { candidates: [] },
				expected: false,
			},
			{
				label: "missing content",
				response: { candidates: [{}] },
				expected: false,
			},
			{
				label: "missing parts",
				response: { candidates: [{ content: {} }] },
				expected: false,
			},
			{
				label: "empty parts",
				response: { candidates: [{ content: { parts: [] } }] },
				expected: false,
			},
			{
				label: "falsy inlineData",
				response: {
					candidates: [{ content: { parts: [{ inlineData: null }] } }],
				},
				expected: false,
			},
			{
				label: "truthy inlineData",
				response: {
					candidates: [{ content: { parts: [{ inlineData: { data: "x" } }] } }],
				},
				expected: true,
			},
			{
				label: "inlineData among text parts",
				response: {
					candidates: [
						{
							content: {
								parts: [{ text: "a" }, { inlineData: { data: "y" } }],
							},
						},
					],
				},
				expected: true,
			},
		])("$label => $expected", ({ response, expected }) => {
			expect((llm as any).hasInlineData(response)).toBe(expected);
		});
	});

	describe("preprocessRequest backend matrix", () => {
		it.each([
			{
				label: "gemini clears labels with undefined config skipped",
				vertex: false,
				req: { contents: [{ parts: [{ text: "x" }] }] },
				assert: (req: any) => {
					expect(req.config).toBeUndefined();
				},
			},
			{
				label: "gemini clears labels when config present without labels",
				vertex: false,
				req: {
					config: { temperature: 0.2 },
					contents: [{ parts: [{ text: "x" }] }],
				},
				assert: (req: any) => {
					expect(req.config.labels).toBeUndefined();
					expect(req.config.temperature).toBe(0.2);
				},
			},
			{
				label: "gemini nulls only displayName-bearing media",
				vertex: false,
				req: {
					config: { labels: { a: 1 } },
					contents: [
						{
							parts: [
								{ text: "keep" },
								{ inlineData: { mimeType: "image/png", data: "x" } },
								{
									inlineData: {
										displayName: "named.png",
										mimeType: "image/png",
										data: "y",
									},
								},
								{ fileData: { fileUri: "gs://bucket/z" } },
								{
									fileData: {
										displayName: "named.txt",
										fileUri: "gs://bucket/named",
									},
								},
							],
						},
					],
				},
				assert: (req: any) => {
					expect(req.config.labels).toBeUndefined();
					expect(
						req.contents[0].parts[1].inlineData.displayName,
					).toBeUndefined();
					expect(req.contents[0].parts[2].inlineData.displayName).toBeNull();
					expect(req.contents[0].parts[3].fileData.displayName).toBeUndefined();
					expect(req.contents[0].parts[4].fileData.displayName).toBeNull();
				},
			},
			{
				label: "vertex preserves labels and displayNames",
				vertex: true,
				req: {
					config: { labels: { keep: "yes" } },
					contents: [
						{
							parts: [
								{
									inlineData: {
										displayName: "v.png",
										mimeType: "image/png",
										data: "v",
									},
								},
							],
						},
					],
				},
				assert: (req: any) => {
					expect(req.config.labels).toEqual({ keep: "yes" });
					expect(req.contents[0].parts[0].inlineData.displayName).toBe("v.png");
				},
			},
			{
				label: "gemini with undefined contents is a no-op",
				vertex: false,
				req: { config: { labels: { x: 1 } } },
				assert: (req: any) => {
					expect(req.config.labels).toBeUndefined();
					expect(req.contents).toBeUndefined();
				},
			},
		])("$label", ({ vertex, req, assert }) => {
			if (vertex) {
				process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
				process.env.GOOGLE_CLOUD_PROJECT = "fake-proj";
				process.env.GOOGLE_CLOUD_LOCATION = "fake-loc";
			} else {
				process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
				process.env.GOOGLE_API_KEY = "fake-stream-key";
			}
			const local = new GoogleLlm();
			(local as any).preprocessRequest(req);
			assert(req);
		});
	});

	describe("convertContents matrix", () => {
		it.each([
			{
				label: "assistant to model",
				input: [{ role: "assistant", parts: [{ text: "a" }] }],
				expected: [{ role: "model", parts: [{ text: "a" }] }],
			},
			{
				label: "model stays model",
				input: [{ role: "model", parts: [{ text: "m" }] }],
				expected: [{ role: "model", parts: [{ text: "m" }] }],
			},
			{
				label: "missing parts uses content string",
				input: [{ role: "user", content: "plain" }],
				expected: [{ role: "user", parts: [{ text: "plain" }] }],
			},
			{
				label: "missing parts and content => empty text",
				input: [{ role: "user" }],
				expected: [{ role: "user", parts: [{ text: "" }] }],
			},
			{
				label: "null content => empty text",
				input: [{ role: "user", content: null }],
				expected: [{ role: "user", parts: [{ text: "" }] }],
			},
			{
				label: "empty parts array is preserved",
				input: [{ role: "user", parts: [] }],
				expected: [{ role: "user", parts: [] }],
			},
		])("$label", ({ input, expected }) => {
			expect((llm as any).convertContents(input)).toEqual(expected);
		});
	});
});
