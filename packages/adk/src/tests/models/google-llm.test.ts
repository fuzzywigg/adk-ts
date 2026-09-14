import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { GoogleLlm } from "../../models/google-llm";
import { GoogleGenAI } from "@google/genai";

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

	it("defaults constructor model to gemini-2.5-flash", () => {
		expect(new GoogleLlm().model).toBe("gemini-2.5-flash");
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

		it("prefers Vertex when Vertex env and project/location are set even with API key", () => {
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
			process.env.GOOGLE_CLOUD_PROJECT = "proj";
			process.env.GOOGLE_CLOUD_LOCATION = "loc";
			process.env.GOOGLE_API_KEY = "abc";
			const llm = new GoogleLlm();
			llm.apiClient;
			expect(GoogleGenAI).toHaveBeenCalledWith({
				vertexai: true,
				project: "proj",
				location: "loc",
			});
			expect(GoogleGenAI).not.toHaveBeenCalledWith({ apiKey: "abc" });
		});

		it("falls through to API key when Vertex flag is set but project/location missing", () => {
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
			process.env.GOOGLE_CLOUD_PROJECT = "proj";
			process.env.GOOGLE_CLOUD_LOCATION = undefined;
			process.env.GOOGLE_API_KEY = "fallback-key";
			const llm = new GoogleLlm();
			llm.apiClient;
			expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: "fallback-key" });
		});

		it("caches the client instance across accesses", () => {
			process.env.GOOGLE_API_KEY = "abc";
			const llm = new GoogleLlm();
			const first = llm.apiClient;
			const second = llm.apiClient;
			expect(first).toBe(second);
			expect(GoogleGenAI).toHaveBeenCalledTimes(1);
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

		it("sets both x-goog-api-client and user-agent with node version", () => {
			process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID = undefined;
			const llm = new GoogleLlm();
			const headers = llm.trackingHeaders;
			expect(headers["user-agent"]).toBe(headers["x-goog-api-client"]);
			expect(headers["user-agent"]).toContain(`gl-node/${process.version}`);
		});

		it("caches trackingHeaders after first computation", () => {
			const llm = new GoogleLlm();
			const first = llm.trackingHeaders;
			process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID = "changed";
			const second = llm.trackingHeaders;
			expect(second).toBe(first);
			expect(second["x-goog-api-client"]).not.toMatch(
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

		it("preprocessRequest preserves labels and displayNames for Vertex AI", () => {
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
			process.env.GOOGLE_CLOUD_PROJECT = "proj";
			process.env.GOOGLE_CLOUD_LOCATION = "loc";
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
						],
					},
				],
			};
			(llm as any).preprocessRequest(req);
			expect(req.config.labels).toEqual({ team: "adk" });
			expect(req.contents[0].parts[0].inlineData.displayName).toBe("a.png");
		});

		it("preprocessRequest skips contents without parts under Gemini API", () => {
			process.env.GOOGLE_API_KEY = "abc";
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
			const llm = new GoogleLlm();
			const req = {
				config: { labels: { a: 1 } },
				contents: [
					{ role: "user" },
					{
						parts: [
							{
								inlineData: { displayName: "c.png", data: "z" },
							},
						],
					},
				],
			};
			(llm as any).preprocessRequest(req);
			expect(req.config.labels).toBeUndefined();
			expect(req.contents[0].parts).toBeUndefined();
			expect(req.contents[1].parts[0].inlineData.displayName).toBeNull();
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
		beforeEach(() => {
			process.env.GOOGLE_API_KEY = "abc";
			process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
		});

		it("yields a non-stream LlmResponse from generateContent", async () => {
			const generateContent = vi.fn().mockResolvedValue({
				candidates: [
					{
						content: { parts: [{ text: "hello gemini" }] },
						groundingMetadata: { queries: ["q"] },
					},
				],
				usageMetadata: { candidatesTokenCount: 7, totalTokenCount: 11 },
			});
			(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
				() => ({
					models: {
						generateContent,
						generateContentStream: vi.fn(),
					},
				}),
			);

			const llm = new GoogleLlm("gemini-2.0-flash");
			const request = {
				model: "gemini-custom",
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { temperature: 0.1 },
			};

			const responses: any[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				request,
				false,
			)) {
				responses.push(response);
			}

			expect(generateContent).toHaveBeenCalledWith({
				model: "gemini-custom",
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { temperature: 0.1 },
			});
			expect(responses).toHaveLength(1);
			expect(responses[0].content).toEqual({
				parts: [{ text: "hello gemini" }],
			});
			expect(responses[0].groundingMetadata).toEqual({ queries: ["q"] });
			expect(responses[0].usageMetadata?.candidatesTokenCount).toBe(7);
		});

		it("streams partial text, merge clears, and final STOP leftover", async () => {
			const stream = (async function* () {
				yield {
					candidates: [{ content: { parts: [{ text: "A" }] } }],
					usageMetadata: { totalTokenCount: 1 },
				};
				yield {
					candidates: [{ content: { parts: [{ text: "B" }] } }],
					usageMetadata: { totalTokenCount: 2 },
				};
				yield {
					candidates: [{ content: { parts: [] } }],
					usageMetadata: { totalTokenCount: 2 },
				};
				yield {
					candidates: [
						{
							content: { parts: [{ text: "" }] },
							finishReason: "STOP",
						},
					],
					usageMetadata: { totalTokenCount: 3 },
				};
			})();

			const generateContentStream = vi.fn().mockResolvedValue(stream);
			(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
				() => ({
					models: {
						generateContent: vi.fn(),
						generateContentStream,
					},
				}),
			);

			const llm = new GoogleLlm();
			const responses: any[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				{
					contents: [{ role: "user", parts: [{ text: "hi" }] }],
					config: {},
				},
				true,
			)) {
				responses.push(response);
			}

			expect(generateContentStream).toHaveBeenCalledOnce();
			expect(
				responses.some((r) => r.partial && r.content?.parts?.[0]?.text === "A"),
			).toBe(true);
			expect(
				responses.some(
					(r) =>
						!r.partial &&
						r.content?.parts?.[0]?.text === "AB" &&
						r.usageMetadata?.totalTokenCount === 2,
				),
			).toBe(true);
		});

		it("uses the instance model when request.model is omitted", async () => {
			const generateContent = vi.fn().mockResolvedValue({
				candidates: [{ content: { parts: [{ text: "ok" }] } }],
			});
			(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
				() => ({
					models: { generateContent, generateContentStream: vi.fn() },
				}),
			);

			const llm = new GoogleLlm("gemini-2.5-flash");
			for await (const _ of (llm as any).generateContentAsyncImpl(
				{ contents: [{ role: "user", parts: [{ text: "x" }] }] },
				false,
			)) {
				/* drain */
			}

			expect(generateContent).toHaveBeenCalledWith(
				expect.objectContaining({ model: "gemini-2.5-flash" }),
			);
		});

		it("streams thought parts separately then merges with text", async () => {
			const stream = (async function* () {
				yield {
					candidates: [
						{ content: { parts: [{ text: "think-", thought: true }] } },
					],
				};
				yield {
					candidates: [
						{ content: { parts: [{ text: "ing", thought: true }] } },
					],
				};
				yield {
					candidates: [{ content: { parts: [{ text: "Hi" }] } }],
				};
				yield {
					candidates: [{ content: { parts: [] } }],
				};
				yield {
					candidates: [
						{
							content: { parts: [{ text: "" }] },
							finishReason: "STOP",
						},
					],
					usageMetadata: { totalTokenCount: 9 },
				};
			})();

			const generateContentStream = vi.fn().mockResolvedValue(stream);
			(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
				() => ({
					models: {
						generateContent: vi.fn(),
						generateContentStream,
					},
				}),
			);

			const llm = new GoogleLlm();
			const responses: any[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				{ contents: [{ role: "user", parts: [{ text: "hi" }] }] },
				true,
			)) {
				responses.push(response);
			}

			const merged = responses.find(
				(r) =>
					!r.partial &&
					r.content?.parts?.some((p: any) => p.thought) &&
					r.content?.parts?.some((p: any) => !p.thought && p.text === "Hi"),
			);
			expect(merged).toBeTruthy();
			expect(merged.content.parts).toEqual(
				expect.arrayContaining([
					{ text: "think-ing", thought: true },
					{ text: "Hi" },
				]),
			);
		});

		it("skips merge branch when hasInlineData is true", async () => {
			const stream = (async function* () {
				yield {
					candidates: [{ content: { parts: [{ text: "A" }] } }],
				};
				yield {
					candidates: [
						{
							content: {
								parts: [{ inlineData: { data: "img", mimeType: "image/png" } }],
							},
						},
					],
				};
			})();

			(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
				() => ({
					models: {
						generateContent: vi.fn(),
						generateContentStream: vi.fn().mockResolvedValue(stream),
					},
				}),
			);

			const llm = new GoogleLlm();
			const responses: any[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				{ contents: [{ role: "user", parts: [{ text: "hi" }] }] },
				true,
			)) {
				responses.push(response);
			}

			expect(
				responses.some(
					(r) => !r.partial && r.content?.parts?.[0]?.text === "A",
				),
			).toBe(false);
			expect(
				responses.some(
					(r) => r.content?.parts?.[0]?.inlineData?.data === "img",
				),
			).toBe(true);
		});

		it("merges accumulated text mid-stream on empty chunk but skips final leftover for MAX_TOKENS", async () => {
			const stream = (async function* () {
				yield {
					candidates: [{ content: { parts: [{ text: "partial" }] } }],
				};
				yield {
					candidates: [
						{
							content: { parts: [{ text: "" }] },
							finishReason: "MAX_TOKENS",
						},
					],
				};
			})();

			(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
				() => ({
					models: {
						generateContent: vi.fn(),
						generateContentStream: vi.fn().mockResolvedValue(stream),
					},
				}),
			);

			const llm = new GoogleLlm();
			const responses: any[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				{ contents: [{ role: "user", parts: [{ text: "hi" }] }] },
				true,
			)) {
				responses.push(response);
			}

			const merged = responses.filter(
				(r) => !r.partial && r.content?.parts?.[0]?.text === "partial",
			);
			expect(merged).toHaveLength(1);
			expect(
				responses.filter((r) => r.content?.parts?.[0]?.text === "partial"),
			).toHaveLength(2);
		});

		it("merges on error-shaped chunk without candidates and skips STOP leftover", async () => {
			const stream = (async function* () {
				yield {
					candidates: [{ content: { parts: [{ text: "x" }] } }],
				};
				yield {
					usageMetadata: { totalTokenCount: 1 },
				};
			})();

			(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
				() => ({
					models: {
						generateContent: vi.fn(),
						generateContentStream: vi.fn().mockResolvedValue(stream),
					},
				}),
			);

			const llm = new GoogleLlm();
			const responses: any[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				{ contents: [{ role: "user", parts: [{ text: "hi" }] }] },
				true,
			)) {
				responses.push(response);
			}

			expect(responses.some((r) => r.errorCode === "UNKNOWN_ERROR")).toBe(true);
			expect(
				responses.filter(
					(r) => !r.partial && r.content?.parts?.[0]?.text === "x",
				),
			).toHaveLength(1);
		});

		it("yields error-shaped non-stream response without parts", async () => {
			const generateContent = vi.fn().mockResolvedValue({
				candidates: [
					{
						finishReason: "SAFETY",
						finishMessage: "blocked",
					},
				],
				usageMetadata: { totalTokenCount: 0 },
			});
			(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
				() => ({
					models: { generateContent, generateContentStream: vi.fn() },
				}),
			);

			const llm = new GoogleLlm();
			const responses: any[] = [];
			for await (const response of (llm as any).generateContentAsyncImpl(
				{ contents: [{ role: "user", parts: [{ text: "hi" }] }] },
				false,
			)) {
				responses.push(response);
			}

			expect(responses).toHaveLength(1);
			expect(responses[0].errorCode).toBe("SAFETY");
			expect(responses[0].errorMessage).toBe("blocked");
			expect(responses[0].content).toBeUndefined();
		});

		it("caches liveApiClient across accesses", () => {
			process.env.GOOGLE_API_KEY = "abc";
			process.env.GOOGLE_GENAI_USE_VERTEXAI = undefined;
			const llm = new GoogleLlm();
			const first = llm.liveApiClient;
			const second = llm.liveApiClient;
			expect(first).toBe(second);
			expect(GoogleGenAI).toHaveBeenCalledTimes(1);
		});

		it("caches apiBackend after first read", () => {
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
			const llm = new GoogleLlm();
			expect(llm.apiBackend).toBe("VERTEX_AI");
			process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
			expect(llm.apiBackend).toBe("VERTEX_AI");
		});
	});
});
