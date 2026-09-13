import { afterEach, describe, expect, it } from "vitest";
import type { BaseLlm } from "../../models/base-llm";
import { LLMRegistry, type LlmModel } from "../../models/llm-registry";

type LlmClassLike = {
	new (model: string): BaseLlm;
	supportedModels(): string[];
};

class FakeLlm {
	constructor(public model: string) {}

	static supportedModels(): string[] {
		return ["^fake-.*$", "^stub-model$"];
	}
}

const FakeLlmClass = FakeLlm as unknown as LlmClassLike;

const fakeModel: LlmModel = {
	async generateContent() {
		return { content: { role: "model", parts: [{ text: "ok" }] } } as any;
	},
};

describe("LLMRegistry", () => {
	afterEach(() => {
		LLMRegistry.clear();
	});

	it("registers LLM classes from supportedModels patterns", () => {
		LLMRegistry.registerLLM(FakeLlmClass);

		expect(LLMRegistry.resolve("fake-1")?.name).toBe("FakeLlm");
		expect(LLMRegistry.resolve("stub-model")?.name).toBe("FakeLlm");
		expect(LLMRegistry.resolve("other")).toBeNull();
	});

	it("creates LLM instances and throws for unknown models", () => {
		LLMRegistry.registerLLM(FakeLlmClass);

		const llm = LLMRegistry.newLLM("fake-chat");
		expect((llm as FakeLlm).model).toBe("fake-chat");
		expect(() => LLMRegistry.newLLM("missing")).toThrow(
			"No LLM class found for model: missing",
		);
	});

	it("manages named model instances", () => {
		LLMRegistry.registerModel("named", fakeModel);

		expect(LLMRegistry.hasModel("named")).toBe(true);
		expect(LLMRegistry.getModel("named")).toBe(fakeModel);
		expect(LLMRegistry.getModelOrCreate("named")).toBe(fakeModel);

		LLMRegistry.unregisterModel("named");
		expect(LLMRegistry.hasModel("named")).toBe(false);
		expect(() => LLMRegistry.getModel("named")).toThrow(
			"Model 'named' not found in registry",
		);
	});

	it("falls back to class registry in getModelOrCreate", () => {
		LLMRegistry.registerLLM(FakeLlmClass);

		const created = LLMRegistry.getModelOrCreate("fake-2");
		expect((created as FakeLlm).model).toBe("fake-2");
	});

	it("clears models and classes independently", () => {
		LLMRegistry.registerLLM(FakeLlmClass);
		LLMRegistry.registerModel("named", fakeModel);

		LLMRegistry.clearModels();
		expect(LLMRegistry.hasModel("named")).toBe(false);
		expect(LLMRegistry.resolve("fake-1")).not.toBeNull();

		LLMRegistry.clearClasses();
		expect(LLMRegistry.resolve("fake-1")).toBeNull();
	});

	it("logRegisteredModels runs without throwing", () => {
		LLMRegistry.registerLLM(FakeLlmClass);
		LLMRegistry.registerModel("named", fakeModel);
		expect(() => LLMRegistry.logRegisteredModels()).not.toThrow();
	});
});
