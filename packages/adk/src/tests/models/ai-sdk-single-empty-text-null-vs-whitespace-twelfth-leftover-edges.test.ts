import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

vi.mock("ai", () => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

function makeAiModel(modelId = "mock-model"): LanguageModel {
	return {
		modelId,
		provider: "mock",
		specificationVersion: "v2",
	} as unknown as LanguageModel;
}

/**
 * Twelfth leftover: AI SDK twin of OpenAI eleventh empty-text trap.
 * `if (parts.length === 1 && parts[0].text)` skips `""`, then the collector
 * also skips falsy text → null. Whitespace takes the shortcut.
 */
describe("ai-sdk single-empty-text null vs whitespace twelfth leftover edges", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		llm = new AiSdkLlm(makeAiModel());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		"user",
		"model",
		"assistant",
		"system",
	])("role %j single empty-string text returns null (not a throw)", (role) => {
		expect(
			(llm as any).contentToAiSdkMessage({
				role,
				parts: [{ text: "" }],
			}),
		).toBeNull();
	});

	it("whitespace-only single text takes shortcut (truthy)", () => {
		expect(
			(llm as any).contentToAiSdkMessage({
				role: "user",
				parts: [{ text: " " }],
			}),
		).toEqual({ role: "user", content: " " });
	});

	it("system role still uses shortcut for whitespace (unlike empty)", () => {
		expect(
			(llm as any).contentToAiSdkMessage({
				role: "system",
				parts: [{ text: "\t" }],
			}),
		).toEqual({ role: "system", content: "\t" });
	});

	it("non-empty single text still uses shortcut (control)", () => {
		expect(
			(llm as any).contentToAiSdkMessage({
				role: "user",
				parts: [{ text: "hello" }],
			}),
		).toEqual({ role: "user", content: "hello" });
	});
});
