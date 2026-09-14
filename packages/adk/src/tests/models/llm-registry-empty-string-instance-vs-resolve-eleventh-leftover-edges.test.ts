import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMRegistry } from "../../models/llm-registry";

/**
 * Eleventh leftover: empty-string named instance is an exact Map key —
 * hasModel/getModelOrCreate succeed while resolve("") stays null.
 * Distinct from seventh mixed-case provider name sensitivity.
 */
describe("llm-registry empty-string instance vs resolve eleventh leftover edges", () => {
	afterEach(() => {
		LLMRegistry.clear();
	});

	it('registerModel("") is addressable via hasModel/getModel/getModelOrCreate', () => {
		const instance = {
			generateContent: vi.fn(async () => ({})),
		};
		LLMRegistry.registerModel("", instance as any);
		expect(LLMRegistry.hasModel("")).toBe(true);
		expect(LLMRegistry.getModel("")).toBe(instance);
		expect(LLMRegistry.getModelOrCreate("")).toBe(instance);
	});

	it('resolve("") still returns null even with empty-string instance registered', () => {
		LLMRegistry.registerModel("", {
			generateContent: vi.fn(async () => ({})),
		} as any);
		expect(LLMRegistry.resolve("")).toBeNull();
	});

	it('unregisterModel("") removes the empty-string instance', () => {
		LLMRegistry.registerModel("", {
			generateContent: vi.fn(async () => ({})),
		} as any);
		LLMRegistry.unregisterModel("");
		expect(LLMRegistry.hasModel("")).toBe(false);
		expect(() => LLMRegistry.getModel("")).toThrow(/not found/);
	});
});
