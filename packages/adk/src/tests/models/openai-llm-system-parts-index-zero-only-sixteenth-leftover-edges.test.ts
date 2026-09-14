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
 * Sixteenth leftover: system role reads only `content.parts?.[0]?.text || ""`.
 * Fourteenth pinned falsy matrix on parts[0]; parts[1]-only system text loss
 * (index-0 asymmetry) remains.
 */
describe("openai-llm system parts index-zero only sixteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let llm: OpenAiLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		llm = new OpenAiLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("ignores system text sitting only on parts[1]", () => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "system",
				parts: [{ text: undefined }, { text: "late-system" }],
			}),
		).toEqual({ role: "system", content: "" });
	});

	it("keeps parts[0] system text even when parts[1] also has text", () => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "system",
				parts: [{ text: "first" }, { text: "second" }],
			}),
		).toEqual({ role: "system", content: "first" });
	});

	it('parts[0] falsy text still loses parts[1] (|| "" wins over later indexes)', () => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "system",
				parts: [{ text: "" }, { text: "ignored" }],
			}),
		).toEqual({ role: "system", content: "" });
	});
});
