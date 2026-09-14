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

	it("resolve returns the first registered pattern that matches", () => {
		class Early {
			constructor(public model: string) {}
			static supportedModels(): string[] {
				return ["^shared-.*$"];
			}
		}
		class Late {
			constructor(public model: string) {}
			static supportedModels(): string[] {
				return ["^shared-.*$"];
			}
		}

		LLMRegistry.registerLLM(Early as unknown as LlmClassLike);
		LLMRegistry.registerLLM(Late as unknown as LlmClassLike);

		expect(LLMRegistry.resolve("shared-1")?.name).toBe("Early");
		expect(LLMRegistry.newLLM("shared-1")).toBeInstanceOf(Early);
	});

	it("keeps the first Map entry when the same regex string is registered twice", () => {
		class First {
			constructor(public model: string) {}
			static supportedModels(): string[] {
				return ["^exact$"];
			}
		}
		class Second {
			constructor(public model: string) {}
			static supportedModels(): string[] {
				return ["^exact$"];
			}
		}

		// Map keys are distinct RegExp instances, so duplicate pattern strings do not
		// overwrite — resolve returns the earliest matching registration.
		LLMRegistry.register("^exact$", First as unknown as LlmClassLike);
		LLMRegistry.register("^exact$", Second as unknown as LlmClassLike);

		expect(LLMRegistry.resolve("exact")?.name).toBe("First");
	});

	it("getModelOrCreate prefers named instances over class patterns", () => {
		LLMRegistry.registerLLM(FakeLlmClass);
		LLMRegistry.registerModel("fake-1", fakeModel);

		expect(LLMRegistry.getModelOrCreate("fake-1")).toBe(fakeModel);
		expect(LLMRegistry.getModelOrCreate("fake-2")).toBeInstanceOf(FakeLlm);
	});

	it("unregisterModel is a no-op for unknown names", () => {
		expect(() => LLMRegistry.unregisterModel("missing")).not.toThrow();
		expect(LLMRegistry.hasModel("missing")).toBe(false);
	});

	it("clear wipes both class patterns and named instances", () => {
		LLMRegistry.registerLLM(FakeLlmClass);
		LLMRegistry.registerModel("named", fakeModel);

		LLMRegistry.clear();

		expect(LLMRegistry.resolve("fake-1")).toBeNull();
		expect(LLMRegistry.hasModel("named")).toBe(false);
		expect(() => LLMRegistry.newLLM("fake-1")).toThrow(
			"No LLM class found for model: fake-1",
		);
	});

	it("registerLLM registers every supportedModels pattern", () => {
		class Multi {
			constructor(public model: string) {}
			static supportedModels(): string[] {
				return ["^alpha-.*$", "^beta-.*$", "^gamma$"];
			}
		}

		LLMRegistry.registerLLM(Multi as unknown as LlmClassLike);

		expect(LLMRegistry.resolve("alpha-1")?.name).toBe("Multi");
		expect(LLMRegistry.resolve("beta-9")?.name).toBe("Multi");
		expect(LLMRegistry.resolve("gamma")?.name).toBe("Multi");
		expect(LLMRegistry.resolve("delta")).toBeNull();
	});
});
