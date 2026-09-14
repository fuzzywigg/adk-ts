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

describe("GoogleLlm leftover edges (overnight TOKENMAXX post #142)", () => {
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

	it("defaults constructor model to gemini-2.5-flash", () => {
		expect(new GoogleLlm().model).toBe("gemini-2.5-flash");
	});

	it("apiClient falls back to apiKey when Vertex is on but project is missing", () => {
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
		process.env.GOOGLE_CLOUD_PROJECT = undefined;
		process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
		process.env.GOOGLE_API_KEY = "fallback-key";

		const llm = new GoogleLlm();
		llm.apiClient;

		expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: "fallback-key" });
		expect(GoogleGenAI).not.toHaveBeenCalledWith(
			expect.objectContaining({ vertexai: true }),
		);
	});

	it("apiClient and liveApiClient memoize the first constructed client", () => {
		process.env.GOOGLE_API_KEY = "memo-key";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
		const llm = new GoogleLlm();

		const apiA = llm.apiClient;
		const apiB = llm.apiClient;
		const liveA = llm.liveApiClient;
		const liveB = llm.liveApiClient;

		expect(apiA).toBe(apiB);
		expect(liveA).toBe(liveB);
		expect(
			(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
		).toBe(2);
	});

	it("apiBackend memoizes first env read across later env mutation", () => {
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
		const llm = new GoogleLlm();
		expect(llm.apiBackend).toBe("GEMINI_API");

		process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
		expect(llm.apiBackend).toBe("GEMINI_API");
	});

	it("trackingHeaders sets matching user-agent and includes gl-node process.version", () => {
		process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID = undefined;
		const llm = new GoogleLlm();
		const headers = llm.trackingHeaders;

		expect(headers["user-agent"]).toBe(headers["x-goog-api-client"]);
		expect(headers["user-agent"]).toMatch(
			new RegExp(`gl-node/${process.version.replace(/\./g, "\\.")}`),
		);
	});

	it("preprocessRequest under GEMINI_API is a no-op when config and contents are absent", async () => {
		process.env.GOOGLE_API_KEY = "k";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
		mockGenerateContent.mockResolvedValue({
			candidates: [{ content: { parts: [{ text: "ok" }] } }],
		});

		const llm = new GoogleLlm();
		const req = new LlmRequest({});
		delete (req as { config?: unknown }).config;
		delete (req as { contents?: unknown }).contents;

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect(mockGenerateContent).toHaveBeenCalled();
	});

	it("removeDisplayNameIfPresent leaves falsy displayName untouched", async () => {
		process.env.GOOGLE_API_KEY = "k";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
		mockGenerateContent.mockResolvedValue({
			candidates: [{ content: { parts: [{ text: "ok" }] } }],
		});

		const llm = new GoogleLlm();
		const inline = { mimeType: "image/png", data: "abc", displayName: "" };
		const file = { fileUri: "gs://x", mimeType: "text/plain" };
		const req = new LlmRequest({
			contents: [
				{
					role: "user",
					parts: [{ inlineData: inline }, { fileData: file }],
				},
			],
		});

		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}

		expect(inline.displayName).toBe("");
		expect((file as { displayName?: string }).displayName).toBeUndefined();
	});

	it("stream merge fires when buffered text meets a candidate-without-content chunk", async () => {
		process.env.GOOGLE_API_KEY = "k";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";

		mockGenerateContentStream.mockResolvedValue(
			(async function* () {
				yield {
					candidates: [
						{ content: { role: "model", parts: [{ text: "hello" }] } },
					],
					usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
				};
				yield {
					candidates: [{ finishReason: "STOP", finishMessage: "done" }],
					usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
				};
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

		const merged = responses.filter(
			(r) =>
				r.partial !== true &&
				r.content?.parts?.some((p: any) => p.text === "hello") &&
				!r.errorCode,
		);
		expect(merged.length).toBeGreaterThan(0);
	});

	it("empty generateContentStream yields no responses", async () => {
		process.env.GOOGLE_API_KEY = "k";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
		mockGenerateContentStream.mockResolvedValue(
			(async function* () {
				/* empty */
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

		expect(responses).toHaveLength(0);
	});

	it("non-stream logs 0 candidates tokens when usageMetadata is missing", async () => {
		process.env.GOOGLE_API_KEY = "k";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
		mockGenerateContent.mockResolvedValue({
			candidates: [{ content: { parts: [{ text: "ok" }] } }],
		});

		const llm = new GoogleLlm();
		const debug = vi.fn();
		(llm as any).logger = { debug };

		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			false,
		)) {
			/* drain */
		}

		expect(debug).toHaveBeenCalledWith(expect.stringContaining("0 tokens"));
	});

	it("convertContents maps assistant role to model and missing parts to content text", async () => {
		process.env.GOOGLE_API_KEY = "k";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
		mockGenerateContent.mockResolvedValue({
			candidates: [{ content: { parts: [{ text: "ok" }] } }],
		});

		const llm = new GoogleLlm();
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [
					{ role: "assistant", content: "prior reply" } as any,
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
					{ role: "model", parts: [{ text: "prior reply" }] },
					{ role: "user", parts: [{ text: "next" }] },
				],
			}),
		);
	});

	it("skips stream merge when hasInlineData is true even with buffered text", async () => {
		process.env.GOOGLE_API_KEY = "k";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";

		mockGenerateContentStream.mockResolvedValue(
			(async function* () {
				yield {
					candidates: [
						{ content: { role: "model", parts: [{ text: "before" }] } },
					],
				};
				yield {
					candidates: [
						{
							content: {
								role: "model",
								parts: [{ inlineData: { mimeType: "image/png", data: "x" } }],
							},
						},
					],
				};
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

		const nonPartialMerged = responses.filter(
			(r) =>
				r.partial !== true &&
				r.content?.parts?.some((p: any) => p.text === "before"),
		);
		expect(nonPartialMerged).toHaveLength(0);
	});

	it("drops leftover buffers on MAX_TOKENS finish without final merge yield", async () => {
		process.env.GOOGLE_API_KEY = "k";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";

		mockGenerateContentStream.mockResolvedValue(
			(async function* () {
				yield {
					candidates: [
						{
							content: { role: "model", parts: [{ text: "cut-off" }] },
							finishReason: "MAX_TOKENS",
						},
					],
				};
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

		expect(responses.every((r) => r.partial === true || r.content)).toBe(true);
		expect(
			responses.filter(
				(r) =>
					r.partial !== true &&
					r.content?.parts?.some((p: any) => p.text === "cut-off"),
			),
		).toHaveLength(0);
	});

	it("liveApiClient falls back to apiKey when Vertex project is missing", () => {
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
		process.env.GOOGLE_CLOUD_PROJECT = undefined;
		process.env.GOOGLE_CLOUD_LOCATION = "loc";
		process.env.GOOGLE_API_KEY = "live-fallback";

		const llm = new GoogleLlm();
		llm.liveApiClient;

		expect(GoogleGenAI).toHaveBeenCalledWith({
			apiKey: "live-fallback",
			apiVersion: "v1beta1",
		});
	});
});
