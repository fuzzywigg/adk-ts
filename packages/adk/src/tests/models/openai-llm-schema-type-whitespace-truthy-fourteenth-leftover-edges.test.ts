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
		chat: { completions: { create: vi.fn() } },
	})),
}));

/**
 * Fourteenth leftover: transformSchemaForOpenAi — type "" skips toLowerCase;
 * whitespace " " is truthy and lowercased to itself.
 */
describe("openai-llm schema type whitespace truthy fourteenth leftover edges", () => {
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

	it('type " " stays " " after toLowerCase', () => {
		const out = (llm as any).transformSchemaForOpenAi({ type: " " });
		expect(out.type).toBe(" ");
	});

	it('type "" is kept without toLowerCase path change', () => {
		const out = (llm as any).transformSchemaForOpenAi({ type: "" });
		expect(out.type).toBe("");
	});

	it('type "STRING" becomes "string" (control)', () => {
		const out = (llm as any).transformSchemaForOpenAi({ type: "STRING" });
		expect(out.type).toBe("string");
	});

	it('type "0" is truthy and lowercased to "0"', () => {
		const out = (llm as any).transformSchemaForOpenAi({ type: "0" });
		expect(out.type).toBe("0");
	});
});
