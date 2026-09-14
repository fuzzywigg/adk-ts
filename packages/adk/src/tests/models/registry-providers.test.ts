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

	it("resolves Vertex endpoint and long Gemini publisher names", () => {
		LLMRegistry.clear();
		registerProviders();

		expect(
			LLMRegistry.resolve("projects/p1/locations/us-central1/endpoints/12345"),
		).toBe(GoogleLlm);
		expect(
			LLMRegistry.resolve(
				"projects/p1/locations/us/publishers/google/models/gemini-2.0-flash",
			),
		).toBe(GoogleLlm);
	});

	it("resolves OpenAI gpt-5 and o3 families", () => {
		LLMRegistry.clear();
		registerProviders();

		expect(LLMRegistry.resolve("gpt-5.0")).toBe(OpenAiLlm);
		expect(LLMRegistry.resolve("gpt-5-mini")).toBe(OpenAiLlm);
		expect(LLMRegistry.resolve("o3-mini")).toBe(OpenAiLlm);
	});

	it("resolves Anthropic claude-3 and claude-*-4 matrix", () => {
		LLMRegistry.clear();
		registerProviders();

		expect(LLMRegistry.resolve("claude-3-opus")).toBe(AnthropicLlm);
		expect(LLMRegistry.resolve("claude-3-5-haiku")).toBe(AnthropicLlm);
		expect(LLMRegistry.resolve("claude-sonnet-4")).toBe(AnthropicLlm);
		expect(LLMRegistry.resolve("claude-haiku-4")).toBe(AnthropicLlm);
	});

	it("newLLM returns concrete provider instances", () => {
		LLMRegistry.clear();
		registerProviders();

		expect(LLMRegistry.newLLM("gemini-2.5-flash")).toBeInstanceOf(GoogleLlm);
		expect(LLMRegistry.newLLM("claude-3-5-sonnet")).toBeInstanceOf(
			AnthropicLlm,
		);
		expect(LLMRegistry.newLLM("gpt-4o")).toBeInstanceOf(OpenAiLlm);
	});

	it("leaves unrelated model strings unresolved", () => {
		LLMRegistry.clear();
		registerProviders();

		expect(LLMRegistry.resolve("llama-3-70b")).toBeNull();
		expect(LLMRegistry.resolve("mistral-large")).toBeNull();
		expect(LLMRegistry.resolve("")).toBeNull();
	});
});
