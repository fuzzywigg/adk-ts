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

describe("OpenAiLlm thinking-marker case-sensitivity seventh leftover (post #161)", () => {
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
		"<THINKING>",
		"[THINKING]",
		"<Thinking>",
		"[Thinking]",
		"<THINKING>plan",
		"[THINKING] draft",
		"prefix <THINKING> suffix",
		"prefix [THINKING] suffix",
	])("getContentType(%j) → regular (case-sensitive includes)", (content) => {
		expect((llm as any).getContentType(content)).toBe("regular");
	});

	it.each([
		"<thinking>",
		"[thinking]",
		"<thinking>plan",
		"[thinking] draft",
		"prefix <thinking> suffix",
		"prefix [thinking] suffix",
	])("getContentType(%j) → thought (control lowercase)", (content) => {
		expect((llm as any).getContentType(content)).toBe("thought");
	});

	it("near-miss markers without exact substring stay regular", () => {
		expect((llm as any).getContentType("<thinking >")).toBe("regular");
		expect((llm as any).getContentType("[thinking ]")).toBe("regular");
		expect((llm as any).getContentType("thinking")).toBe("regular");
		expect((llm as any).getContentType("<think>")).toBe("regular");
	});
});
