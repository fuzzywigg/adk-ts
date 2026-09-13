import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { GoogleLlm } from "../../models/google-llm";
import { FinishReason, GoogleGenAI } from "@google/genai";
import { LlmRequest } from "../../models/llm-request";
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

describe("GoogleLlm", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		vi.clearAllMocks();
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
		it("yields a non-streaming generateContent response", async () => {
			process.env.GOOGLE_API_KEY = "abc";
			const llm = new GoogleLlm("gemini-2.5-flash");
			const generateContent = vi.fn().mockResolvedValue({
				candidates: [
					{
						content: { parts: [{ text: "hello gemini" }], role: "model" },
						finishReason: FinishReason.STOP,
					},
				],
				usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3 },
			});
			(llm as any)._apiClient = { models: { generateContent } };
			(llm as any)._apiBackend = "GEMINI_API";

			const req = new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { labels: { keep: "me" } },
			});

			const out: LlmResponse[] = [];
			for await (const resp of (llm as any).generateContentAsyncImpl(
				req,
				false,
			)) {
				out.push(resp);
			}

			expect(generateContent).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gemini-2.5-flash",
					contents: [{ role: "user", parts: [{ text: "hi" }] }],
				}),
			);
			expect(req.config?.labels).toBeUndefined();
			expect(out).toHaveLength(1);
			expect(out[0].content?.parts?.[0]).toEqual({ text: "hello gemini" });
		});

		it("streams partial text then yields the raw chunk responses", async () => {
			process.env.GOOGLE_API_KEY = "abc";
			const llm = new GoogleLlm();
			async function* streamResponses() {
				yield {
					candidates: [
						{
							content: { parts: [{ text: "Hel" }], role: "model" },
						},
					],
					usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
				};
				yield {
					candidates: [
						{
							content: { parts: [{ text: "lo" }], role: "model" },
							finishReason: FinishReason.STOP,
						},
					],
					usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
				};
			}
			const generateContentStream = vi
				.fn()
				.mockResolvedValue(streamResponses());
			(llm as any)._apiClient = { models: { generateContentStream } };
			(llm as any)._apiBackend = "GEMINI_API";

			const req = new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "stream" }] }],
			});

			const out: LlmResponse[] = [];
			for await (const resp of (llm as any).generateContentAsyncImpl(
				req,
				true,
			)) {
				out.push(resp);
			}

			expect(generateContentStream).toHaveBeenCalled();
			expect(out.length).toBeGreaterThanOrEqual(2);
			expect(out.some((r) => r.partial === true)).toBe(true);
		});

		it("maps assistant role contents to model for the API", async () => {
			process.env.GOOGLE_API_KEY = "abc";
			const llm = new GoogleLlm();
			const generateContent = vi.fn().mockResolvedValue({
				candidates: [{ content: { parts: [{ text: "ok" }] } }],
			});
			(llm as any)._apiClient = { models: { generateContent } };
			(llm as any)._apiBackend = "VERTEX_AI";

			const req = new LlmRequest({
				contents: [
					{ role: "assistant", parts: [{ text: "prior" }] },
					{ role: "user", parts: [{ text: "next" }] },
				],
			});

			for await (const _ of (llm as any).generateContentAsyncImpl(req)) {
				/* drain */
			}

			expect(generateContent.mock.calls[0][0].contents[0].role).toBe("model");
			expect(generateContent.mock.calls[0][0].contents[1].role).toBe("user");
		});
	});
});
