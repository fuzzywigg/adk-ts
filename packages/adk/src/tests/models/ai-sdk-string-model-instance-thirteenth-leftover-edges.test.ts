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

/**
 * Thirteenth leftover: constructor `typeof modelInstance !== "string"` —
 * any string (including "" / " ") keeps default model id "ai-sdk-model".
 * Happy-path object modelId is already in ai-sdk.test.ts.
 */
describe("ai-sdk string model instance thirteenth leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		"gpt-4o",
		"",
		" ",
		"0",
	])("string %j never becomes modelId (stays ai-sdk-model)", (value) => {
		const llm = new AiSdkLlm(value as unknown as LanguageModel);
		expect(llm.model).toBe("ai-sdk-model");
	});

	it("object modelId is used (control)", () => {
		const llm = new AiSdkLlm({
			modelId: "real-id",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
		expect(llm.model).toBe("real-id");
	});

	it("object with empty-string modelId still assigns empty (not default)", () => {
		const llm = new AiSdkLlm({
			modelId: "",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
		expect(llm.model).toBe("");
	});
});
