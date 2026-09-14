import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: {
			completions: {
				create: vi.fn(),
			},
		},
	})),
}));

/**
 * Eleventh leftover: OpenAI hasInlineData truthiness matrix — mirrors Google
 * tenth leftover for part.inlineData {} vs null/""/0/false.
 */
describe("openai-llm hasInlineData falsy-truthiness eleventh leftover edges", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		llm = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		{ label: "inlineData empty object", inlineData: {}, expected: true },
		{
			label: "inlineData with data",
			inlineData: { data: "x" },
			expected: true,
		},
		{ label: "inlineData null", inlineData: null, expected: false },
		{ label: "inlineData undefined", inlineData: undefined, expected: false },
		{ label: "inlineData empty string", inlineData: "", expected: false },
		{ label: "inlineData 0", inlineData: 0, expected: false },
		{ label: "inlineData false", inlineData: false, expected: false },
	])("$label → $expected", ({ inlineData, expected }) => {
		expect(
			(llm as any).hasInlineData({
				content: { parts: [{ inlineData }] },
			}),
		).toBe(expected);
	});

	it("returns false when parts empty or content missing", () => {
		expect((llm as any).hasInlineData({ content: { parts: [] } })).toBe(false);
		expect((llm as any).hasInlineData({})).toBe(false);
	});

	it("any truthy inlineData in multi-part wins via .some", () => {
		expect(
			(llm as any).hasInlineData({
				content: {
					parts: [
						{ text: "a" },
						{ inlineData: null },
						{ inlineData: { mimeType: "image/png" } },
					],
				},
			}),
		).toBe(true);
	});
});
