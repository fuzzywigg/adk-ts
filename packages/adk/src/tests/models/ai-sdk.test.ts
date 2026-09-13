import { describe, expect, it } from "vitest";
import type { LanguageModel } from "ai";
import { AiSdkLlm } from "../../models/ai-sdk";

describe("AiSdkLlm", () => {
	it("supportedModels returns an empty list", () => {
		expect(AiSdkLlm.supportedModels()).toEqual([]);
	});

	it("uses modelId from a LanguageModel instance", () => {
		const mockModel = {
			modelId: "mock-model",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel;

		const llm = new AiSdkLlm(mockModel);
		expect(llm.model).toBe("mock-model");
	});
});
