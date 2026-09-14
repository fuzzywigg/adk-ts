import { afterEach, describe, expect, it, vi } from "vitest";
import type { BaseLlm } from "../../models/base-llm";
import { LLMRegistry, type LlmModel } from "../../models/llm-registry";

type LlmClassLike = {
	new (model: string): BaseLlm;
	supportedModels(): string[];
};

class PatternLlm {
	constructor(public model: string) {}
	static supportedModels(): string[] {
		return ["^pattern-.*$"];
	}
}

const PatternLlmClass = PatternLlm as unknown as LlmClassLike;

const namedModel: LlmModel = {
	async generateContent() {
		return { content: { role: "model", parts: [{ text: "named" }] } } as any;
	},
};

describe("LLMRegistry deepen edges (TOKENMAXX remainder)", () => {
	afterEach(() => {
		LLMRegistry.clear();
		vi.restoreAllMocks();
	});

	it("registerLLM with empty supportedModels adds no patterns", () => {
		class EmptyModels {
			constructor(public model: string) {}
			static supportedModels(): string[] {
				return [];
			}
		}
		LLMRegistry.registerLLM(EmptyModels as unknown as LlmClassLike);
		expect(LLMRegistry.resolve("anything")).toBeNull();
	});

	it("register throws when the pattern is not a valid RegExp", () => {
		expect(() => LLMRegistry.register("[invalid", PatternLlmClass)).toThrow(
			SyntaxError,
		);
	});

	it("getModelOrCreate falls back to newLLM after clearModels", () => {
		LLMRegistry.registerLLM(PatternLlmClass);
		LLMRegistry.registerModel("pattern-1", namedModel);

		expect(LLMRegistry.getModelOrCreate("pattern-1")).toBe(namedModel);

		LLMRegistry.clearModels();
		const created = LLMRegistry.getModelOrCreate("pattern-1");
		expect(created).toBeInstanceOf(PatternLlm);
		expect((created as PatternLlm).model).toBe("pattern-1");
	});

	it("getModelOrCreate throws after clearClasses when no named model remains", () => {
		LLMRegistry.registerLLM(PatternLlmClass);
		LLMRegistry.clearClasses();
		expect(() => LLMRegistry.getModelOrCreate("pattern-1")).toThrow(
			"No LLM class found for model: pattern-1",
		);
	});

	it("keeps named models after clearClasses", () => {
		LLMRegistry.registerLLM(PatternLlmClass);
		LLMRegistry.registerModel("kept", namedModel);
		LLMRegistry.clearClasses();

		expect(LLMRegistry.resolve("pattern-1")).toBeNull();
		expect(LLMRegistry.getModelOrCreate("kept")).toBe(namedModel);
	});

	it("logRegisteredModels debugs empty registries", () => {
		const debug = vi.fn();
		(LLMRegistry as any).logger = { debug };

		LLMRegistry.logRegisteredModels();

		expect(debug).toHaveBeenCalledWith("Registered LLM class patterns:", []);
		expect(debug).toHaveBeenCalledWith("Registered LLM instances:", []);
	});

	it("logRegisteredModels lists patterns and instance names", () => {
		const debug = vi.fn();
		(LLMRegistry as any).logger = { debug };
		LLMRegistry.registerLLM(PatternLlmClass);
		LLMRegistry.registerModel("alpha", namedModel);
		LLMRegistry.registerModel("beta", namedModel);

		LLMRegistry.logRegisteredModels();

		const patternCall = debug.mock.calls.find(
			(c) => c[0] === "Registered LLM class patterns:",
		);
		const instanceCall = debug.mock.calls.find(
			(c) => c[0] === "Registered LLM instances:",
		);
		expect(patternCall?.[1]).toEqual(
			expect.arrayContaining([expect.stringContaining("pattern-")]),
		);
		expect(instanceCall?.[1].sort()).toEqual(["alpha", "beta"]);
	});

	it("register accepts multiple patterns for one class via registerLLM", () => {
		class Multi {
			constructor(public model: string) {}
			static supportedModels(): string[] {
				return ["^one$", "^two$", "^three-.*$"];
			}
		}
		LLMRegistry.registerLLM(Multi as unknown as LlmClassLike);
		expect(LLMRegistry.resolve("one")?.name).toBe("Multi");
		expect(LLMRegistry.resolve("two")?.name).toBe("Multi");
		expect(LLMRegistry.resolve("three-x")?.name).toBe("Multi");
		expect(LLMRegistry.resolve("four")).toBeNull();
	});

	it("hasModel is false for class-only registrations", () => {
		LLMRegistry.registerLLM(PatternLlmClass);
		expect(LLMRegistry.hasModel("pattern-1")).toBe(false);
		expect(LLMRegistry.resolve("pattern-1")).not.toBeNull();
	});
});
