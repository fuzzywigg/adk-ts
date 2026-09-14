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
 * Twelfth leftover: removeDisplayNameIfPresent uses `if (dataObj?.displayName)`.
 * Leftover already left `""` untouched; whitespace is truthy → null.
 */
describe("google-llm displayName whitespace truthiness twelfth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.GOOGLE_API_KEY = "test-key";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
		vi.clearAllMocks();
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
		" ",
		"\t",
		"\n",
		"0",
	])("truthy displayName %j is nulled", (displayName) => {
		const llm = new GoogleLlm();
		const data = { mimeType: "image/png", displayName };
		(llm as any).removeDisplayNameIfPresent(data);
		expect(data.displayName).toBeNull();
	});

	it.each([
		{ label: "empty", displayName: "" },
		{ label: "0 number", displayName: 0 },
		{ label: "false", displayName: false },
		{ label: "null", displayName: null },
	])("falsy displayName $label is left untouched", ({ displayName }) => {
		const llm = new GoogleLlm();
		const data = { mimeType: "image/png", displayName };
		(llm as any).removeDisplayNameIfPresent(data);
		expect(data.displayName).toBe(displayName);
	});
});
