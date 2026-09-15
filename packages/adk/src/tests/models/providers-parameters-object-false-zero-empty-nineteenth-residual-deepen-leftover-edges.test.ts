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
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `parameters || {}` then `transformSchema*` — non-object `"-Infinity"` / `-1`
 * early-return keep; boxed-falsy are objects so spread-copy to a fresh `{}`.
 */
describe("providers parameters object-false/zero/empty nineteenth residual deepen", () => {
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
		{ label: 'string "-Infinity"', parameters: "-Infinity" as any },
		{ label: "number -1", parameters: -1 as any },
	])("non-object residual parameters kept by identity ($label)", ({
		parameters,
	}) => {
		expect(
			(openai as any).functionDeclarationToOpenAiTool({
				name: "t",
				description: "d",
				parameters,
			}).function.parameters,
		).toBe(parameters);

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
		expect(tools.t.inputSchema).toEqual({ schema: parameters });
	});

	it.each([
		{ label: "Object(false)", parameters: Object(false) as any },
		{ label: "Object(0)", parameters: Object(0) as any },
		{ label: 'Object("")', parameters: Object("") as any },
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
