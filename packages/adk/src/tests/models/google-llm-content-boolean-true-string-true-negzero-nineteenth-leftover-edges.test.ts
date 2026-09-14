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
 * Nineteenth leftover (complement #252 after tip #251): convertContents
 * `content.parts || [{ text: content.content || "" }]`. Twelfth pinned
 * whitespace/`"0"`. Residual: truthy near-miss `parts` keep (bypass fallback);
 * `-0` parts coalesce; content residual keep vs `-0` → `""`.
 */
describe("google-llm content boolean-true/string-true/negzero nineteenth leftover edges", () => {
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
		{ label: "boolean true", parts: true as any },
		{ label: "string true", parts: "true" as any },
		{ label: "empty array", parts: [] as any },
		{
			label: "NEGATIVE_INFINITY",
			parts: Number.NEGATIVE_INFINITY as any,
		},
	])("truthy parts=$label kept (no || fallback)", ({ parts }) => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([{ role: "user", parts, content: "x" }]),
		).toEqual([{ role: "user", parts }]);
	});

	it("SameValueZero -0 parts coalesce to content fallback", () => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([
				{ role: "user", parts: -0 as any, content: "kept" },
			]),
		).toEqual([{ role: "user", parts: [{ text: "kept" }] }]);
	});

	it.each([
		{ label: "boolean true", content: true as any, expected: true },
		{ label: "string true", content: "true", expected: "true" },
		{ label: "empty array", content: [] as any, expected: [] },
		{
			label: "NEGATIVE_INFINITY",
			content: Number.NEGATIVE_INFINITY as any,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "-0", content: -0 as any, expected: "" },
	])('content || "" when parts missing ($label)', ({ content, expected }) => {
		const llm = new GoogleLlm();
		expect((llm as any).convertContents([{ role: "user", content }])).toEqual([
			{ role: "user", parts: [{ text: expected }] },
		]);
	});
});
