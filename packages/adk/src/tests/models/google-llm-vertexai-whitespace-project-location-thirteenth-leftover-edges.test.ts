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
 * Thirteenth leftover: useVertexAI && project && location — whitespace / "0"
 * are truthy so Vertex is used (eleventh only pinned empty-string fallback).
 */
describe("google-llm vertexai whitespace project/location thirteenth leftover edges", () => {
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

	it.each([
		{ project: " ", location: "us-central1" },
		{ project: "\t", location: "us-central1" },
		{ project: "0", location: "us-central1" },
		{ project: "my-proj", location: " " },
		{ project: "my-proj", location: "0" },
	])("truthy whitespace/zero project=$project location=$location uses vertexai", ({
		project,
		location,
	}) => {
		process.env.GOOGLE_CLOUD_PROJECT = project;
		process.env.GOOGLE_CLOUD_LOCATION = location;
		void new GoogleLlm().apiClient;
		expect(GoogleGenAI).toHaveBeenCalledWith({
			vertexai: true,
			project,
			location,
		});
	});

	it("empty-string project still falls back to apiKey (eleventh control)", () => {
		process.env.GOOGLE_CLOUD_PROJECT = "";
		process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
		void new GoogleLlm().apiClient;
		expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: "fallback-key" });
	});

	it("liveApiClient also keeps whitespace project/location as Vertex", () => {
		process.env.GOOGLE_CLOUD_PROJECT = " ";
		process.env.GOOGLE_CLOUD_LOCATION = " ";
		void new GoogleLlm().liveApiClient;
		expect(GoogleGenAI).toHaveBeenCalledWith(
			expect.objectContaining({
				vertexai: true,
				project: " ",
				location: " ",
			}),
		);
	});
});
