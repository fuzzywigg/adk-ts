import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMRegistry } from "../../models/llm-registry";

/**
 * Twelfth leftover: modelInstances Map keys are exact. `" "` is not `""`.
 * Eleventh leftover only registered empty-string instances.
 */
describe("llm-registry whitespace instance Map key twelfth leftover edges", () => {
	afterEach(() => {
		LLMRegistry.clear();
	});

	it('registerModel(" ") is distinct from empty-string key', () => {
		const instance = {
			generateContent: vi.fn(async () => ({})),
		};
		LLMRegistry.registerModel(" ", instance as any);
		expect(LLMRegistry.hasModel(" ")).toBe(true);
		expect(LLMRegistry.hasModel("")).toBe(false);
		expect(LLMRegistry.getModel(" ")).toBe(instance);
		expect(() => LLMRegistry.getModel("")).toThrow(/not found/);
	});

	it('resolve(" ") stays null even with whitespace instance registered', () => {
		LLMRegistry.registerModel(" ", {
			generateContent: vi.fn(async () => ({})),
		} as any);
		expect(LLMRegistry.resolve(" ")).toBeNull();
		expect(LLMRegistry.resolve("")).toBeNull();
	});

	it("getModelOrCreate uses the whitespace instance without newLLM", () => {
		const instance = {
			generateContent: vi.fn(async () => ({})),
		};
		LLMRegistry.registerModel(" ", instance as any);
		expect(LLMRegistry.getModelOrCreate(" ")).toBe(instance);
	});

	it('unregisterModel(" ") does not delete empty-string instance', () => {
		const space = { generateContent: vi.fn(async () => ({})) };
		const empty = { generateContent: vi.fn(async () => ({})) };
		LLMRegistry.registerModel(" ", space as any);
		LLMRegistry.registerModel("", empty as any);
		LLMRegistry.unregisterModel(" ");
		expect(LLMRegistry.hasModel(" ")).toBe(false);
		expect(LLMRegistry.hasModel("")).toBe(true);
		expect(LLMRegistry.getModel("")).toBe(empty);
	});
});
