import { afterEach, describe, expect, it } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";
import { GoogleLlm } from "../../models/google-llm";
import { LLMRegistry } from "../../models/llm-registry";
import { OpenAiLlm } from "../../models/openai-llm";
import { registerProviders } from "../../models/registry";

describe("registerProviders", () => {
	afterEach(() => {
		LLMRegistry.clear();
		registerProviders();
	});

	it("registers Google, Anthropic, and OpenAI patterns after clear", () => {
		LLMRegistry.clear();
		expect(LLMRegistry.resolve("gemini-2.5-flash")).toBeNull();
		expect(LLMRegistry.resolve("claude-3-5-sonnet")).toBeNull();
		expect(LLMRegistry.resolve("gpt-4o")).toBeNull();

		registerProviders();

		expect(LLMRegistry.resolve("gemini-2.5-flash")).toBe(GoogleLlm);
		expect(LLMRegistry.resolve("claude-3-5-sonnet")).toBe(AnthropicLlm);
		expect(LLMRegistry.resolve("gpt-4o")).toBe(OpenAiLlm);
		expect(LLMRegistry.resolve("gpt-4.1-mini")).toBe(OpenAiLlm);
	});

	it("matches additional OpenAI and Google model id shapes", () => {
		LLMRegistry.clear();
		registerProviders();

		expect(LLMRegistry.resolve("gpt-4")).toBe(OpenAiLlm);
		expect(LLMRegistry.resolve("gpt-4-turbo")).toBe(OpenAiLlm);
		expect(LLMRegistry.resolve("gpt-4o")).toBe(OpenAiLlm);
		expect(LLMRegistry.resolve("o1-preview")).toBe(OpenAiLlm);
		expect(LLMRegistry.resolve("o1-mini")).toBe(OpenAiLlm);
		expect(LLMRegistry.resolve("o3-mini")).toBe(OpenAiLlm);
		expect(LLMRegistry.resolve("o1")).toBeNull();
		expect(LLMRegistry.resolve("gemini-2.0-flash")).toBe(GoogleLlm);
		expect(LLMRegistry.resolve("gemini-exp-1206")).toBe(GoogleLlm);
		expect(
			LLMRegistry.resolve(
				"projects/p/locations/us/endpoints/1234567890123456789",
			),
		).toBe(GoogleLlm);
		expect(
			LLMRegistry.resolve(
				"projects/p/locations/us/publishers/google/models/gemini-2.5-pro",
			),
		).toBe(GoogleLlm);
		expect(LLMRegistry.resolve("claude-3-opus")).toBe(AnthropicLlm);
		expect(LLMRegistry.resolve("claude-3-5-haiku-latest")).toBe(AnthropicLlm);
		expect(LLMRegistry.resolve("claude-sonnet-4")).toBe(AnthropicLlm);
		expect(LLMRegistry.resolve("not-a-model")).toBeNull();
	});

	it("newLLM constructs provider instances for registered patterns", () => {
		LLMRegistry.clear();
		registerProviders();

		const google = LLMRegistry.newLLM("gemini-2.5-flash");
		const openai = LLMRegistry.newLLM("gpt-4o-mini");
		const anthropic = LLMRegistry.newLLM("claude-3-5-sonnet");

		expect(google).toBeInstanceOf(GoogleLlm);
		expect(openai).toBeInstanceOf(OpenAiLlm);
		expect(anthropic).toBeInstanceOf(AnthropicLlm);
		expect(google.model).toBe("gemini-2.5-flash");
		expect(openai.model).toBe("gpt-4o-mini");
		expect(anthropic.model).toBe("claude-3-5-sonnet");
	});
});
