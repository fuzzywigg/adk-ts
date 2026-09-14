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
 * Twelfth leftover: convertContents `content.content || ""` keeps whitespace
 * and `"0"` (truthy). Fifth leftover only asserted falsy coalesces.
 */
describe("google-llm content whitespace || coalesce twelfth leftover edges", () => {
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
		{ label: "space", content: " " },
		{ label: "tab", content: "\t" },
		{ label: "newline", content: "\n" },
		{ label: "zero digit", content: "0" },
	])("$label content is kept via || when parts missing", ({ content }) => {
		const llm = new GoogleLlm();
		expect((llm as any).convertContents([{ role: "user", content }])).toEqual([
			{ role: "user", parts: [{ text: content }] },
		]);
	});

	it("empty-string still coalesces to empty (control)", () => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([{ role: "user", content: "" }]),
		).toEqual([{ role: "user", parts: [{ text: "" }] }]);
	});

	it('whitespace parts "" falls back then keeps whitespace content', () => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([{ role: "user", parts: "", content: " " }]),
		).toEqual([{ role: "user", parts: [{ text: " " }] }]);
	});
});
