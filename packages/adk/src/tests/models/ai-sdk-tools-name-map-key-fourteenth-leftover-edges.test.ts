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
 * Fourteenth leftover: convertToAiSdkTools keys by funcDecl.name exactly —
 * case / "" / " " are distinct; duplicate name overwrites.
 */
describe("ai-sdk tools name map-key fourteenth leftover edges", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		llm = new AiSdkLlm(makeAiModel());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Search and search are distinct keys", () => {
		const tools = (llm as any).convertToAiSdkTools(
			new LlmRequest({
				config: {
					tools: [
						{
							functionDeclarations: [
								{ name: "Search", description: "U", parameters: {} },
								{ name: "search", description: "L", parameters: {} },
							],
						},
					],
				} as any,
			}),
		);
		expect(tools.Search.description).toBe("U");
		expect(tools.search.description).toBe("L");
	});

	it("empty-string and whitespace names are distinct keys", () => {
		const tools = (llm as any).convertToAiSdkTools(
			new LlmRequest({
				config: {
					tools: [
						{
							functionDeclarations: [
								{ name: "", description: "empty", parameters: {} },
								{ name: " ", description: "space", parameters: {} },
							],
						},
					],
				} as any,
			}),
		);
		expect(tools[""].description).toBe("empty");
		expect(tools[" "].description).toBe("space");
	});

	it("duplicate name overwrites the earlier declaration", () => {
		const tools = (llm as any).convertToAiSdkTools(
			new LlmRequest({
				config: {
					tools: [
						{
							functionDeclarations: [
								{ name: "dup", description: "first", parameters: {} },
								{ name: "dup", description: "second", parameters: {} },
							],
						},
					],
				} as any,
			}),
		);
		expect(tools.dup.description).toBe("second");
		expect(Object.keys(tools)).toEqual(["dup"]);
	});
});
