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
 * Fourteenth leftover: `else if (apiKey)` — empty-string GOOGLE_API_KEY is
 * falsy so apiClient throws (unlike whitespace / "0" which construct).
 */
describe("google-llm api-key empty-string falsy fourteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		vi.clearAllMocks();
		delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
		delete process.env.GOOGLE_CLOUD_PROJECT;
		delete process.env.GOOGLE_CLOUD_LOCATION;
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: vi.fn(),
					generateContentStream: vi.fn(),
				},
			}),
		);
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it.each([
		{ label: "empty string", key: "" },
		{ label: "undefined via delete", key: undefined },
	])("apiClient throws when GOOGLE_API_KEY is $label", ({ key }) => {
		if (key === undefined) {
			delete process.env.GOOGLE_API_KEY;
		} else {
			process.env.GOOGLE_API_KEY = key;
		}
		expect(() => new GoogleLlm().apiClient).toThrow(/Google API Key/);
		expect(GoogleGenAI).not.toHaveBeenCalled();
	});

	it.each([
		{ label: "whitespace", key: " " },
		{ label: "zero string", key: "0" },
	])("apiClient keeps truthy GOOGLE_API_KEY ($label)", ({ key }) => {
		process.env.GOOGLE_API_KEY = key;
		void new GoogleLlm().apiClient;
		expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: key });
	});

	it("liveApiClient also throws on empty-string GOOGLE_API_KEY", () => {
		process.env.GOOGLE_API_KEY = "";
		expect(() => new GoogleLlm().liveApiClient).toThrow(
			/API configuration required/,
		);
	});
});
