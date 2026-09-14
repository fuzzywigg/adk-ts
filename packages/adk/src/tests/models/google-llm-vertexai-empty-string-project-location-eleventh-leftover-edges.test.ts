import { GoogleGenAI } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleLlm } from "../../models/google-llm";

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
 * Eleventh leftover: useVertexAI && project && location — empty-string
 * project/location are falsy so client falls back to apiKey despite exact
 * GOOGLE_GENAI_USE_VERTEXAI="true". Distinct from seventh case-mismatched flag.
 */
describe("google-llm vertexai empty-string project/location eleventh leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		vi.clearAllMocks();
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: vi.fn(),
					generateContentStream: vi.fn(),
				},
			}),
		);
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
		process.env.GOOGLE_API_KEY = "fallback-key";
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it("empty-string project falls back to apiKey", () => {
		process.env.GOOGLE_CLOUD_PROJECT = "";
		process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
		void new GoogleLlm().apiClient;
		expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: "fallback-key" });
		expect(GoogleGenAI).not.toHaveBeenCalledWith(
			expect.objectContaining({ vertexai: true }),
		);
	});

	it("empty-string location falls back to apiKey", () => {
		process.env.GOOGLE_CLOUD_PROJECT = "my-proj";
		process.env.GOOGLE_CLOUD_LOCATION = "";
		void new GoogleLlm().apiClient;
		expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: "fallback-key" });
	});

	it("both empty-string project and location fall back to apiKey", () => {
		process.env.GOOGLE_CLOUD_PROJECT = "";
		process.env.GOOGLE_CLOUD_LOCATION = "";
		void new GoogleLlm().apiClient;
		expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: "fallback-key" });
	});

	it("truthy project+location still uses vertexai (control)", () => {
		process.env.GOOGLE_CLOUD_PROJECT = "my-proj";
		process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
		void new GoogleLlm().apiClient;
		expect(GoogleGenAI).toHaveBeenCalledWith({
			vertexai: true,
			project: "my-proj",
			location: "us-central1",
		});
	});
});
