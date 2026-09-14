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

describe("GoogleLlm convertContents role/content fifth leftover", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.GOOGLE_API_KEY = "fifth-key";
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

	it("exact assistant role remaps to model", () => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([
				{ role: "assistant", parts: [{ text: "a" }] },
			]),
		).toEqual([{ role: "model", parts: [{ text: "a" }] }]);
	});

	it.each([
		{ label: "Assistant", role: "Assistant" },
		{ label: "ASSISTANT", role: "ASSISTANT" },
		{ label: "Model", role: "Model" },
		{ label: "MODEL", role: "MODEL" },
		{ label: "assistant ", role: "assistant " },
		{ label: " assistant", role: " assistant" },
	])('$label role is not remapped (strict === "assistant")', ({ role }) => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([{ role, parts: [{ text: "x" }] }]),
		).toEqual([{ role, parts: [{ text: "x" }] }]);
	});

	it.each([
		{ label: "empty-string", content: "" },
		{ label: "null", content: null },
		{ label: "0", content: 0 },
		{ label: "false", content: false },
		{ label: "undefined", content: undefined },
	])('$label content coalesces to "" via || when parts missing', ({
		content,
	}) => {
		const llm = new GoogleLlm();
		expect((llm as any).convertContents([{ role: "user", content }])).toEqual([
			{ role: "user", parts: [{ text: "" }] },
		]);
	});

	it("truthy non-string content number 1 is kept via ||", () => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([{ role: "user", content: 1 }]),
		).toEqual([{ role: "user", parts: [{ text: 1 }] }]);
	});

	it("falsy parts [] is truthy so content fallback is skipped", () => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([
				{ role: "user", parts: [], content: "ignored" },
			]),
		).toEqual([{ role: "user", parts: [] }]);
	});

	it.each([
		{ label: "null parts", parts: null },
		{ label: "undefined parts", parts: undefined },
		{ label: "false parts", parts: false },
		{ label: "0 parts", parts: 0 },
		{ label: "empty-string parts", parts: "" },
	])('$label falls back to content || "" via parts ||', ({ parts }) => {
		const llm = new GoogleLlm();
		expect(
			(llm as any).convertContents([
				{ role: "user", parts, content: "legacy" },
			]),
		).toEqual([{ role: "user", parts: [{ text: "legacy" }] }]);
	});
});
