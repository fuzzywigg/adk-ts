import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
import { LlmRequest } from "../../models/llm-request";

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
 * Fourteenth leftover: `"functionDeclarations" in toolConfig` — missing key
 * skips; present key with null/undefined still enters the `in` branch.
 */
describe("ai-sdk functionDeclarations in-operator fourteenth leftover edges", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		llm = new AiSdkLlm(makeAiModel());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("tool without functionDeclarations key yields {}", () => {
		const tools = (llm as any).convertToAiSdkTools(
			new LlmRequest({
				config: {
					tools: [{ googleSearch: {} }],
				} as any,
			}),
		);
		expect(tools).toEqual({});
	});

	it("empty functionDeclarations array yields {}", () => {
		const tools = (llm as any).convertToAiSdkTools(
			new LlmRequest({
				config: {
					tools: [{ functionDeclarations: [] }],
				} as any,
			}),
		);
		expect(tools).toEqual({});
	});

	it("functionDeclarations: null enters `in` and throws on for-of", () => {
		expect(() =>
			(llm as any).convertToAiSdkTools(
				new LlmRequest({
					config: {
						tools: [{ functionDeclarations: null }],
					} as any,
				}),
			),
		).toThrow();
	});

	it("functionDeclarations: undefined enters `in` and throws on for-of", () => {
		expect(() =>
			(llm as any).convertToAiSdkTools(
				new LlmRequest({
					config: {
						tools: [{ functionDeclarations: undefined }],
					} as any,
				}),
			),
		).toThrow();
	});
});
