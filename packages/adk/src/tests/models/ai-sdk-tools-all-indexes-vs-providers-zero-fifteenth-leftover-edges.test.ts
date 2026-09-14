import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
import { LlmRequest } from "../../models/llm-request";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("ai", () => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

/**
 * Fifteenth leftover: AI SDK walks every tools[] entry; OpenAI/Anthropic only
 * tools[0]. Reverse asymmetry of thirteenth/fourteenth index-zero leftovers.
 */
describe("ai-sdk tools all indexes vs providers zero fifteenth leftover edges", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		llm = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
	});

	it("maps functionDeclarations sitting only on tools[1]", () => {
		const tools = (llm as any).convertToAiSdkTools(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: {
					tools: [
						{ googleSearch: {} } as any,
						{
							functionDeclarations: [
								{
									name: "from-index-1",
									description: "d",
									parameters: { type: "object" },
								},
							],
						} as any,
					],
				},
			}),
		);
		expect(Object.keys(tools)).toEqual(["from-index-1"]);
	});

	it("maps functionDeclarations from multiple tool configs", () => {
		const tools = (llm as any).convertToAiSdkTools(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: {
					tools: [
						{
							functionDeclarations: [
								{ name: "a", description: "da", parameters: {} },
							],
						} as any,
						{
							functionDeclarations: [
								{ name: "b", description: "db", parameters: {} },
							],
						} as any,
					],
				},
			}),
		);
		expect(Object.keys(tools).sort()).toEqual(["a", "b"]);
	});
});
