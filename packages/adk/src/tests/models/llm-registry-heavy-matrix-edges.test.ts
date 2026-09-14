import { afterEach, describe, expect, it, vi } from "vitest";
import type { BaseLlm } from "../../models/base-llm";
import { LLMRegistry, type LlmModel } from "../../models/llm-registry";

type LlmClassLike = {
	new (model: string): BaseLlm;
	supportedModels(): string[];
};

class AlphaLlm {
	constructor(public model: string) {}
	static supportedModels(): string[] {
		return ["^alpha-.*$"];
	}
}

class BetaLlm {
	constructor(public model: string) {}
	static supportedModels(): string[] {
		return ["^beta-.*$", "^shared-.*$"];
	}
}

class GammaLlm {
	constructor(public model: string) {}
	static supportedModels(): string[] {
		return ["^shared-.*$", "^gamma$"];
	}
}

const AlphaClass = AlphaLlm as unknown as LlmClassLike;
const BetaClass = BetaLlm as unknown as LlmClassLike;
const GammaClass = GammaLlm as unknown as LlmClassLike;

const makeModel = (label: string): LlmModel => ({
	async generateContent() {
		return {
			content: { role: "model", parts: [{ text: label }] },
		} as any;
	},
});

describe("LLMRegistry heavy matrix leftover edges", () => {
	afterEach(() => {
		LLMRegistry.clear();
	});

	it.each([
		{ model: "alpha-1", expected: "AlphaLlm" },
		{ model: "beta-chat", expected: "BetaLlm" },
		{ model: "gamma", expected: "GammaLlm" },
		{ model: "missing", expected: null },
		{ model: "", expected: null },
	])("resolve($model) → $expected", ({ model, expected }) => {
		LLMRegistry.registerLLM(AlphaClass);
		LLMRegistry.registerLLM(BetaClass);
		LLMRegistry.registerLLM(GammaClass);
		const resolved = LLMRegistry.resolve(model);
		expect(resolved?.name ?? null).toBe(expected);
	});

	it("keeps the first Map entry when shared regex patterns are registered twice", () => {
		LLMRegistry.registerLLM(BetaClass);
		LLMRegistry.registerLLM(GammaClass);
		const resolved = LLMRegistry.resolve("shared-x");
		expect(resolved?.name).toBe("BetaLlm");
	});

	it.each([
		{ model: "alpha-x", ok: true },
		{ model: "nope", ok: false },
	])("newLLM($model) ok=$ok", ({ model, ok }) => {
		LLMRegistry.registerLLM(AlphaClass);
		if (ok) {
			expect((LLMRegistry.newLLM(model) as AlphaLlm).model).toBe(model);
		} else {
			expect(() => LLMRegistry.newLLM(model)).toThrow(
				`No LLM class found for model: ${model}`,
			);
		}
	});

	it("registerModel / hasModel / getModel / unregisterModel matrix", () => {
		const names = ["a", "b", "c"];
		for (const name of names) {
			LLMRegistry.registerModel(name, makeModel(name));
		}
		for (const name of names) {
			expect(LLMRegistry.hasModel(name)).toBe(true);
			expect(LLMRegistry.getModel(name)).toBeTruthy();
		}
		LLMRegistry.unregisterModel("b");
		expect(LLMRegistry.hasModel("b")).toBe(false);
		expect(() => LLMRegistry.getModel("b")).toThrow(
			"Model 'b' not found in registry",
		);
		expect(LLMRegistry.hasModel("a")).toBe(true);
	});

	it.each([
		{ name: "inst", registerInst: true, registerClass: false, via: "instance" },
		{ name: "alpha-z", registerInst: false, registerClass: true, via: "class" },
	])("getModelOrCreate prefers instance then class ($via)", ({
		name,
		registerInst,
		registerClass,
	}) => {
		if (registerInst) {
			LLMRegistry.registerModel(name, makeModel(name));
		}
		if (registerClass) {
			LLMRegistry.registerLLM(AlphaClass);
		}
		const result = LLMRegistry.getModelOrCreate(name);
		if (registerInst) {
			expect(result).toBe(LLMRegistry.getModel(name));
		} else {
			expect((result as AlphaLlm).model).toBe(name);
		}
	});

	it("getModelOrCreate throws when neither instance nor class matches", () => {
		expect(() => LLMRegistry.getModelOrCreate("ghost")).toThrow(
			"No LLM class found for model: ghost",
		);
	});

	it("clear / clearModels / clearClasses independence matrix", () => {
		LLMRegistry.registerLLM(AlphaClass);
		LLMRegistry.registerModel("named", makeModel("named"));

		LLMRegistry.clearModels();
		expect(LLMRegistry.hasModel("named")).toBe(false);
		expect(LLMRegistry.resolve("alpha-1")).not.toBeNull();

		LLMRegistry.registerModel("named", makeModel("named"));
		LLMRegistry.clearClasses();
		expect(LLMRegistry.resolve("alpha-1")).toBeNull();
		expect(LLMRegistry.hasModel("named")).toBe(true);

		LLMRegistry.clear();
		expect(LLMRegistry.hasModel("named")).toBe(false);
		expect(LLMRegistry.resolve("alpha-1")).toBeNull();
	});

	it("logRegisteredModels emits class patterns and instance names", () => {
		const debug = vi.fn();
		(LLMRegistry as any).logger = { debug };
		LLMRegistry.registerLLM(AlphaClass);
		LLMRegistry.registerModel("n1", makeModel("n1"));
		LLMRegistry.logRegisteredModels();
		expect(debug).toHaveBeenCalledWith(
			"Registered LLM class patterns:",
			expect.any(Array),
		);
		expect(debug).toHaveBeenCalledWith("Registered LLM instances:", ["n1"]);
	});

	it("register direct regex string without supportedModels", () => {
		LLMRegistry.register("^direct$", AlphaClass);
		expect(LLMRegistry.resolve("direct")?.name).toBe("AlphaLlm");
		expect(LLMRegistry.resolve("direct-extra")).toBeNull();
	});
});
