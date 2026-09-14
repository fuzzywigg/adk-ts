import { afterEach, describe, expect, it } from "vitest";
import type { BaseLlm } from "../../models/base-llm";
import { LLMRegistry, type LlmModel } from "../../models/llm-registry";

type LlmClassLike = {
	new (model: string): BaseLlm;
	supportedModels(): string[];
};

class OpenAiLike {
	constructor(public model: string) {}
	static supportedModels(): string[] {
		return ["^gpt-4.*$", "^o1-.*$"];
	}
}

class GeminiLike {
	constructor(public model: string) {}
	static supportedModels(): string[] {
		return ["^gemini-.*$"];
	}
}

class ClaudeLike {
	constructor(public model: string) {}
	static supportedModels(): string[] {
		return ["^claude-3-.*$"];
	}
}

describe("LLMRegistry provider case-sensitivity seventh leftover (post #158)", () => {
	afterEach(() => {
		LLMRegistry.clear();
	});

	it.each([
		{
			Class: OpenAiLike,
			lower: "gpt-4o",
			upper: "GPT-4o",
			mixed: "Gpt-4O",
		},
		{
			Class: GeminiLike,
			lower: "gemini-2.0-flash",
			upper: "Gemini-2.0-flash",
			mixed: "GEMINI-2.0-FLASH",
		},
		{
			Class: ClaudeLike,
			lower: "claude-3-5-sonnet",
			upper: "Claude-3-5-sonnet",
			mixed: "CLAUDE-3-5-SONNET",
		},
	] as const)("$Class.name patterns match lowercase only (RegExp without /i)", ({
		Class,
		lower,
		upper,
		mixed,
	}) => {
		LLMRegistry.registerLLM(Class as unknown as LlmClassLike);
		expect(LLMRegistry.resolve(lower)?.name).toBe(Class.name);
		expect(LLMRegistry.resolve(upper)).toBeNull();
		expect(LLMRegistry.resolve(mixed)).toBeNull();
	});

	it("newLLM throws for uppercase provider ids that would match case-insensitively", () => {
		LLMRegistry.registerLLM(OpenAiLike as unknown as LlmClassLike);
		expect(() => LLMRegistry.newLLM("GPT-4o-mini")).toThrow(
			/No LLM class found for model: GPT-4o-mini/,
		);
	});

	it("hasModel / getModel named instances are exact-key case-sensitive", () => {
		const model: LlmModel = {
			async generateContent() {
				return { content: { role: "model", parts: [{ text: "ok" }] } } as any;
			},
		};
		LLMRegistry.registerModel("MyModel", model);
		expect(LLMRegistry.hasModel("MyModel")).toBe(true);
		expect(LLMRegistry.hasModel("mymodel")).toBe(false);
		expect(LLMRegistry.hasModel("MYMODEL")).toBe(false);
		expect(() => LLMRegistry.getModel("mymodel")).toThrow(/not found/);
	});
});
