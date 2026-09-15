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
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * convertContents `content.parts || [{ text: content.content || "" }]` —
 * boxed-falsy / `"-Infinity"` / `-1` parts keep; content residual keep.
 */
describe("google-llm content object-false/zero/empty nineteenth residual deepen", () => {
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
		{ label: "Object(false)", parts: Object(false) as any },
		{ label: "Object(0)", parts: Object(0) as any },
		{ label: 'Object("")', parts: Object("") as any },
		{ label: "Object(NaN)", parts: Object(Number.NaN) as any },
		{ label: 'string "-Infinity"', parts: "-Infinity" as any },
		{ label: "number -1", parts: -1 as any },
	])("truthy parts=$label kept (no || fallback)", ({ parts }) => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([{ role: "user", parts, content: "x" }]),
		).toEqual([{ role: "user", parts }]);
	});

	it.each([
		{ label: "Object(false)", content: Object(false) as any },
		{ label: "Object(0)", content: Object(0) as any },
		{ label: 'Object("")', content: Object("") as any },
		{ label: "Object(NaN)", content: Object(Number.NaN) as any },
		{ label: 'string "-Infinity"', content: "-Infinity" as any },
		{ label: "number -1", content: -1 as any },
	])('content || "" when parts missing ($label) kept', ({ content }) => {
		const llm = new GoogleLlm();
		expect((llm as any).convertContents([{ role: "user", content }])).toEqual([
			{ role: "user", parts: [{ text: content }] },
		]);
	});
});
