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

	it("matches supportedModels prefixes for each provider", () => {
		LLMRegistry.clear();
		registerProviders();

		expect(GoogleLlm.supportedModels().some((p) => p.includes("gemini"))).toBe(
			true,
		);
		expect(
			AnthropicLlm.supportedModels().some((p) => p.includes("claude")),
		).toBe(true);
		expect(OpenAiLlm.supportedModels().some((p) => p.includes("gpt"))).toBe(
			true,
		);

		expect(LLMRegistry.resolve("gemini-1.5-pro")).toBe(GoogleLlm);
		expect(LLMRegistry.resolve("claude-opus-4")).toBe(AnthropicLlm);
		expect(LLMRegistry.resolve("gpt-3.5-turbo")).toBe(OpenAiLlm);
		expect(LLMRegistry.resolve("o1-preview")).toBe(OpenAiLlm);
	});
});
