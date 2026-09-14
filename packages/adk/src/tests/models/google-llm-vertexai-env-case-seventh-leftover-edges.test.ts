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

describe("GoogleLlm GOOGLE_GENAI_USE_VERTEXAI case-sensitivity seventh leftover (post #161)", () => {
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
		process.env.GOOGLE_CLOUD_PROJECT = "proj";
		process.env.GOOGLE_CLOUD_LOCATION = "loc";
		process.env.GOOGLE_API_KEY = "fallback-key";
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		"TRUE",
		"True",
		" true",
		"true ",
		"1",
		"yes",
		"TRUE ",
	])('env %j !== exact "true" → GEMINI_API + apiKey client', (flag) => {
		process.env.GOOGLE_GENAI_USE_VERTEXAI = flag;
		const llm = new GoogleLlm();

		expect(llm.apiBackend).toBe("GEMINI_API");
		llm.apiClient;
		expect(GoogleGenAI).toHaveBeenCalledWith({
			apiKey: "fallback-key",
		});
		expect(GoogleGenAI).not.toHaveBeenCalledWith(
			expect.objectContaining({ vertexai: true }),
		);
	});

	it('exact lowercase "true" still selects Vertex (control)', () => {
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
		const llm = new GoogleLlm();

		expect(llm.apiBackend).toBe("VERTEX_AI");
		llm.apiClient;
		expect(GoogleGenAI).toHaveBeenCalledWith({
			vertexai: true,
			project: "proj",
			location: "loc",
		});
	});

	it("empty string and undefined stay GEMINI_API", () => {
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "";
		expect(new GoogleLlm().apiBackend).toBe("GEMINI_API");

		delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
		expect(new GoogleLlm().apiBackend).toBe("GEMINI_API");
	});
});
