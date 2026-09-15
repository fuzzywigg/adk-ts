import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: { completions: { create: vi.fn() } },
	})),
}));

vi.mock("ai", () => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

/**
 * Twentieth leftover residual deepen (complements #282 object-true/one/infinity):
 * `parameters || {}` then `transformSchema*` — boxed falsy `Object(false)` /
 * `Object(0)` / `Object(NaN)` are objects so spread-copy to a fresh `{}`
 * (bypasses `|| {}` coalesce, loses identity) — sibling of Object(true).
 */
describe("providers parameters object-false/zero/nan twentieth residual deepen", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let openai: OpenAiLlm;
	let aiSdk: AiSdkLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		openai = new OpenAiLlm();
		aiSdk = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it.each([
		{ label: "Object(false)", parameters: Object(false) as any },
		{ label: "Object(0)", parameters: Object(0) as any },
		{ label: "Object(NaN)", parameters: Object(Number.NaN) as any },
	])("$label bypasses || {} then transformSchema spread-copies to {}", ({
		parameters,
	}) => {
		const openaiParams = (openai as any).functionDeclarationToOpenAiTool({
			name: "t",
			description: "d",
			parameters,
		}).function.parameters;
		expect(openaiParams).toEqual({});
		expect(openaiParams).not.toBe(parameters);

		const tools = (aiSdk as any).convertToAiSdkTools({
			contents: [],
			config: {
				tools: [
					{
						functionDeclarations: [{ name: "t", description: "d", parameters }],
					},
				],
			},
		});
		expect(tools.t.inputSchema).toEqual({ schema: {} });
		expect(tools.t.inputSchema.schema).not.toBe(parameters);
	});
});
