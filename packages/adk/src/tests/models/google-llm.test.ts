import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { FinishReason, GoogleGenAI } from "@google/genai";
import { GoogleLlm } from "../../models/google-llm";
import { LlmResponse } from "../../models/llm-response";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@google/genai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@google/genai")>();
	return {
		...actual,
		GoogleGenAI: vi.fn(),
	};
});

async function* asAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
	for (const item of items) {
		yield item;
	}
}

describe("GoogleLlm", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let mockGenerateContent: ReturnType<typeof vi.fn>;
	let mockGenerateContentStream: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		vi.clearAllMocks();
		mockGenerateContent = vi.fn();
		mockGenerateContentStream = vi.fn();
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: mockGenerateContent,
					generateContentStream: mockGenerateContentStream,
				},
			}),
		);
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should set model in constructor", () => {
		const llm = new GoogleLlm("foo-model");
		expect(llm.model).toBe("foo-model");
	});

	it("supportedModels returns expected patterns", () => {
		expect(GoogleLlm.supportedModels()).toEqual([
			"gemini-.*",
			"projects/.+/locations/.+/endpoints/.+",
			"projects/.+/locations/.+/publishers/google/models/gemini.+",
		]);
	});

	describe("apiClient", () => {
		it("creates GoogleGenAI with VertexAI config if env vars set", () => {
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
			process.env.GOOGLE_CLOUD_PROJECT = "proj";
			process.env.GOOGLE_CLOUD_LOCATION = "loc";
			const llm = new GoogleLlm();
			const client = llm.apiClient;
			expect(GoogleGenAI).toHaveBeenCalledWith({
				vertexai: true,
				project: "proj",
				location: "loc",
			});
			expect(client).toBe(llm.apiClient);
		});

		it("creates GoogleGenAI with apiKey if set", () => {
			process.env.GOOGLE_API_KEY = "abc";
			process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
			const llm = new GoogleLlm();
			const client = llm.apiClient;
			expect(GoogleGenAI).toHaveBeenCalledWith({
				apiKey: "abc",
			});
			expect(client).toBe(llm.apiClient);
		});

		it("throws if no API key or VertexAI config", () => {
			process.env.GOOGLE_API_KEY = undefined;
			process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
			process.env.GOOGLE_CLOUD_PROJECT = undefined;
			process.env.GOOGLE_CLOUD_LOCATION = undefined;
			const llm = new GoogleLlm();
			expect(() => llm.apiClient).toThrow(
				/Google API Key or Vertex AI configuration is required/,
			);
		});
	});

	describe("apiBackend", () => {
		it("returns VERTEX_AI if GOOGLE_GENAI_USE_VERTEXAI is true", () => {
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
			const llm = new GoogleLlm();
			expect(llm.apiBackend).toBe("VERTEX_AI");
		});
		it("returns GEMINI_API if GOOGLE_GENAI_USE_VERTEXAI is not true", () => {
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
			const llm = new GoogleLlm();
			expect(llm.apiBackend).toBe("GEMINI_API");
		});
	});

	describe("trackingHeaders", () => {
		it("returns correct headers with and without AGENT_ENGINE_TELEMETRY_ENV_VARIABLE_NAME", () => {
			const llm = new GoogleLlm();
			process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID = undefined;
			const headers1 = llm.trackingHeaders;
			expect(headers1["x-goog-api-client"]).toMatch(/google-adk\/1\.0\.0/);
			process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID = "foo";

			(llm as any)._trackingHeaders = undefined;
			const headers2 = llm.trackingHeaders;
			expect(headers2["x-goog-api-client"]).toMatch(
				/\+remote_reasoning_engine/,
			);
		});
	});

	describe("liveApiVersion", () => {
		it("returns v1beta1 for VERTEX_AI", () => {
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
			const llm = new GoogleLlm();
			expect(llm.liveApiVersion).toBe("v1beta1");
		});
		it("returns v1alpha for GEMINI_API", () => {
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
			const llm = new GoogleLlm();
			expect(llm.liveApiVersion).toBe("v1alpha");
		});
	});

	describe("liveApiClient", () => {
		it("creates GoogleGenAI with VertexAI config and apiVersion", () => {
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
			process.env.GOOGLE_CLOUD_PROJECT = "proj";
			process.env.GOOGLE_CLOUD_LOCATION = "loc";
			const llm = new GoogleLlm();
			const client = llm.liveApiClient;
			expect(GoogleGenAI).toHaveBeenCalledWith({
				vertexai: true,
				project: "proj",
				location: "loc",
				apiVersion: "v1beta1",
			});
			expect(client).toBe(llm.liveApiClient);
		});

		it("creates GoogleGenAI with apiKey and apiVersion", () => {
			process.env.GOOGLE_API_KEY = "abc";
			process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
			const llm = new GoogleLlm();
			const client = llm.liveApiClient;
			expect(GoogleGenAI).toHaveBeenCalledWith({
				apiKey: "abc",
				apiVersion: "v1alpha",
			});
			expect(client).toBe(llm.liveApiClient);
		});

		it("throws if no API key or VertexAI config", () => {
			process.env.GOOGLE_API_KEY = undefined;
			process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
			process.env.GOOGLE_CLOUD_PROJECT = undefined;
			process.env.GOOGLE_CLOUD_LOCATION = undefined;
			const llm = new GoogleLlm();
			expect(() => llm.liveApiClient).toThrow(
				/API configuration required for live client/,
			);
		});
	});

	describe("connect", () => {
		it("should throw error", () => {
			const llm = new GoogleLlm("foo");
			expect(() => llm.connect({} as any)).toThrow(
				"Live connection is not supported for foo.",
			);
		});
	});

	describe("content helpers", () => {
		it("convertContents maps assistant roles and missing parts", () => {
			process.env.GOOGLE_API_KEY = "abc";
			const llm = new GoogleLlm();
			const converted = (llm as any).convertContents([
				{ role: "assistant", parts: [{ text: "hi" }] },
				{ role: "user", content: "plain" },
			]);
			expect(converted).toEqual([
				{ role: "model", parts: [{ text: "hi" }] },
				{ role: "user", parts: [{ text: "plain" }] },
			]);
		});

		it("removeDisplayNameIfPresent nulls displayName", () => {
			process.env.GOOGLE_API_KEY = "abc";
			const llm = new GoogleLlm();
			const data = { displayName: "photo.png", mimeType: "image/png" };
			(llm as any).removeDisplayNameIfPresent(data);
			expect(data.displayName).toBeNull();
			expect(() =>
				(llm as any).removeDisplayNameIfPresent(undefined),
			).not.toThrow();
		});

		it("preprocessRequest clears labels and displayNames for Gemini API", () => {
			process.env.GOOGLE_API_KEY = "abc";
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
			const llm = new GoogleLlm();
			const req = {
				config: { labels: { team: "adk" } },
				contents: [
					{
						parts: [
							{
								inlineData: {
									displayName: "a.png",
									mimeType: "image/png",
									data: "x",
								},
							},
							{
								fileData: {
									displayName: "b.txt",
									fileUri: "gs://bucket/b",
								},
							},
						],
					},
				],
			};
			(llm as any).preprocessRequest(req);
			expect(req.config.labels).toBeUndefined();
			expect(req.contents[0].parts[0].inlineData.displayName).toBeNull();
			expect(req.contents[0].parts[1].fileData.displayName).toBeNull();
		});

		it("hasInlineData detects GenAI response shapes", () => {
			process.env.GOOGLE_API_KEY = "abc";
			const llm = new GoogleLlm();
			expect(
				(llm as any).hasInlineData({
					candidates: [{ content: { parts: [{ inlineData: { data: "x" } }] } }],
				}),
			).toBe(true);
			expect(
				(llm as any).hasInlineData({
					candidates: [{ content: { parts: [{ text: "hi" }] } }],
				}),
			).toBe(false);
			expect((llm as any).hasInlineData({})).toBe(false);
		});
	});

	describe("generateContentAsyncImpl", () => {
		const baseRequest = {
			contents: [{ role: "user", parts: [{ text: "Hello" }] }],
			config: { temperature: 0.2 },
		};

		beforeEach(() => {
			process.env.GOOGLE_API_KEY = "test-key";
			process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
		});

		it("yields a non-stream response from generateContent", async () => {
			mockGenerateContent.mockResolvedValue({
				candidates: [
					{
						content: { role: "model", parts: [{ text: "Hi" }] },
					},
				],
				usageMetadata: {
					promptTokenCount: 2,
					candidatesTokenCount: 1,
					totalTokenCount: 3,
				},
			});

			const llm = new GoogleLlm();
			const results: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest,
			)) {
				results.push(response);
			}

			expect(results).toHaveLength(1);
			expect(results[0].content?.parts).toEqual([{ text: "Hi" }]);
			expect(mockGenerateContent).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gemini-2.5-flash",
					contents: [{ role: "user", parts: [{ text: "Hello" }] }],
				}),
			);
		});

		it("uses request model override and converts assistant role to model", async () => {
			mockGenerateContent.mockResolvedValue({
				candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }],
			});

			const llm = new GoogleLlm();
			for await (const _ of (llm as any).generateContentAsyncImpl({
				...baseRequest,
				model: "gemini-2.0-flash",
				contents: [{ role: "assistant", parts: [{ text: "prior" }] }],
			})) {
				/* drain */
			}

			expect(mockGenerateContent).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gemini-2.0-flash",
					contents: [{ role: "model", parts: [{ text: "prior" }] }],
				}),
			);
		});

		it("clears labels and displayName for Gemini API backend", async () => {
			mockGenerateContent.mockResolvedValue({
				candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }],
			});
			const request = {
				...baseRequest,
				config: { labels: { env: "test" } },
				contents: [
					{
						role: "user",
						parts: [
							{
								text: "with file",
								inlineData: { displayName: "pic", data: "abc" },
								fileData: { displayName: "doc", fileUri: "gs://x" },
							},
						],
					},
				],
			};

			const llm = new GoogleLlm();
			for await (const _ of (llm as any).generateContentAsyncImpl(request)) {
				/* drain */
			}

			expect((request.config as any).labels).toBeUndefined();
			expect(
				(request.contents[0].parts[0] as any).inlineData.displayName,
			).toBeNull();
			expect(
				(request.contents[0].parts[0] as any).fileData.displayName,
			).toBeNull();
		});

		it("streams partial text then final STOP merge", async () => {
			mockGenerateContentStream.mockResolvedValue(
				asAsyncIterable([
					{
						candidates: [
							{ content: { role: "model", parts: [{ text: "Hel" }] } },
						],
					},
					{
						candidates: [
							{ content: { role: "model", parts: [{ text: "lo" }] } },
						],
					},
					{
						candidates: [
							{
								content: { role: "model", parts: [{ text: "" }] },
								finishReason: FinishReason.STOP,
							},
						],
						usageMetadata: { totalTokenCount: 4 },
					},
				]),
			);

			const llm = new GoogleLlm();
			const results: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest,
				true,
			)) {
				results.push(response);
			}

			expect(results.some((r) => r.partial === true)).toBe(true);
			expect(mockGenerateContentStream).toHaveBeenCalled();
			expect(
				results.some((r) =>
					r.content?.parts?.some((p: any) => p.text === "Hello"),
				),
			).toBe(true);
		});

		it("accumulates thought parts while streaming", async () => {
			mockGenerateContentStream.mockResolvedValue(
				asAsyncIterable([
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
						candidates: [
							{ content: { role: "model", parts: [{ text: "done" }] } },
						],
					},
					{
						candidates: [
							{
								content: { role: "model", parts: [] },
								finishReason: FinishReason.STOP,
							},
						],
					},
				]),
			);

			const llm = new GoogleLlm();
			const results: LlmResponse[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				baseRequest,
				true,
			)) {
				results.push(response);
			}

			expect(
				results.some((r) =>
					r.content?.parts?.some(
						(p: any) => p.text === "plan" && p.thought === true,
					),
				),
			).toBe(true);
		});

		it("falls back to content.content text when parts are missing", async () => {
			mockGenerateContent.mockResolvedValue({
				candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }],
			});

			const llm = new GoogleLlm();
			for await (const _ of (llm as any).generateContentAsyncImpl({
				contents: [{ role: "user", content: "plain" }],
				config: {},
			})) {
				/* drain */
			}

			expect(mockGenerateContent).toHaveBeenCalledWith(
				expect.objectContaining({
					contents: [{ role: "user", parts: [{ text: "plain" }] }],
				}),
			);
		});
	});
});
