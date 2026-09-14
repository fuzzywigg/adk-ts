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
 * Twelfth leftover: partToOpenAiContent only reads snake_case inline_data.
 * camelCase inlineData (used by hasInlineData) throws Unsupported part type.
 */
describe("openai-llm inline-data camelCase asymmetry twelfth leftover edges", () => {
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

	it("camelCase inlineData throws Unsupported part type", () => {
		expect(() =>
			(llm as any).partToOpenAiContent({
				inlineData: { mimeType: "image/png", data: "abc" },
			}),
		).toThrow(/Unsupported part type/);
	});

	it("snake_case inline_data converts to image_url (control)", () => {
		expect(
			(llm as any).partToOpenAiContent({
				inline_data: { mime_type: "image/png", data: "abc" },
			}),
		).toEqual({
			type: "image_url",
			image_url: {
				url: "data:image/png;base64,abc",
			},
		});
	});

	it("camelCase still counts as hasInlineData (asymmetry vs convert)", () => {
		expect(
			(llm as any).hasInlineData({
				content: {
					parts: [{ inlineData: { mimeType: "image/png", data: "abc" } }],
				},
			}),
		).toBe(true);
	});

	it("empty-string mime_type on snake_case is falsy && and throws", () => {
		expect(() =>
			(llm as any).partToOpenAiContent({
				inline_data: { mime_type: "", data: "abc" },
			}),
		).toThrow(/Unsupported part type/);
	});
});
