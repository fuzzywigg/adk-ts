import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmResponse } from "../../models/llm-response";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

/**
 * Fourteenth leftover: OpenAI hasInlineData only reads camel `inlineData`.
 * Google thirteenth pinned snake/camel; OpenAI eleventh only camel falsy.
 */
describe("openai-llm hasInlineData snake vs camel fourteenth leftover edges", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		llm = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("snake inline_data alone is ignored", () => {
		expect(
			(llm as any).hasInlineData(
				new LlmResponse({
					content: {
						role: "assistant",
						parts: [
							{ inline_data: { data: "x", mime_type: "image/png" } } as any,
						],
					},
				}),
			),
		).toBe(false);
	});

	it("camel inlineData {} is truthy", () => {
		expect(
			(llm as any).hasInlineData(
				new LlmResponse({
					content: {
						role: "assistant",
						parts: [{ inlineData: {} } as any],
					},
				}),
			),
		).toBe(true);
	});

	it("falsy camel with truthy snake stays false", () => {
		expect(
			(llm as any).hasInlineData(
				new LlmResponse({
					content: {
						role: "assistant",
						parts: [
							{
								inlineData: null,
								inline_data: { data: "bytes" },
							} as any,
						],
					},
				}),
			),
		).toBe(false);
	});
});
