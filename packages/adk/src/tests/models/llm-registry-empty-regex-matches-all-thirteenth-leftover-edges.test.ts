import { afterEach, describe, expect, it } from "vitest";
import { BaseLlm } from "../../models/base-llm";
import { LLMRegistry } from "../../models/llm-registry";
import type { LlmRequest } from "../../models/llm-request";
import type { LlmResponse } from "../../models/llm-response";

class DummyLlm extends BaseLlm {
	static override supportedModels(): string[] {
		return [];
	}

	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
	): AsyncGenerator<LlmResponse, void, unknown> {
		yield { content: { role: "model", parts: [{ text: "dummy" }] } };
	}
}

class OtherLlm extends BaseLlm {
	static override supportedModels(): string[] {
		return [];
	}

	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
	): AsyncGenerator<LlmResponse, void, unknown> {
		yield { content: { role: "model", parts: [{ text: "other" }] } };
	}
}

/**
 * Thirteenth leftover: register("", Class) compiles /(?:)/ which matches every
 * model string. Distinct from eleventh/twelfth instance-Map "" / " " keys.
 */
describe("llm-registry empty regex matches all thirteenth leftover edges", () => {
	afterEach(() => {
		LLMRegistry.clear();
	});

	it('register("") resolves any model to Dummy', () => {
		LLMRegistry.register("", DummyLlm);
		expect(LLMRegistry.resolve("gpt-4")).toBe(DummyLlm);
		expect(LLMRegistry.resolve(" ")).toBe(DummyLlm);
		expect(LLMRegistry.resolve("x")).toBe(DummyLlm);
		expect(LLMRegistry.resolve("")).toBe(DummyLlm);
	});

	it("first-registered pattern still wins over later empty regex", () => {
		LLMRegistry.register("gpt-4.*", OtherLlm);
		LLMRegistry.register("", DummyLlm);
		expect(LLMRegistry.resolve("gpt-4o")).toBe(OtherLlm);
		expect(LLMRegistry.resolve("claude")).toBe(DummyLlm);
	});

	it("clearClasses restores null resolve", () => {
		LLMRegistry.register("", DummyLlm);
		LLMRegistry.clearClasses();
		expect(LLMRegistry.resolve("gpt-4")).toBeNull();
	});
});
