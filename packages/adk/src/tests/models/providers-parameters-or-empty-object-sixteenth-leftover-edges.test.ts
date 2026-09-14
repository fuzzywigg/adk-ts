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
 * Sixteenth leftover: `parameters || {}` on OpenAI / AI SDK tool mapping.
 * Fifteenth covered args / result.text / tools indexes — not declaration
 * parameters coalesce.
 */
describe("providers parameters or-empty object sixteenth leftover edges", () => {
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
		{ label: "null", parameters: null },
		{ label: "0", parameters: 0 },
		{ label: "false", parameters: false },
		{ label: "empty string", parameters: "" },
		{ label: "undefined", parameters: undefined },
	])("OpenAI parameters || {} ($label)", ({ parameters }) => {
		const tool = (openai as any).functionDeclarationToOpenAiTool({
			name: "t",
			description: "d",
			parameters,
		});
		expect(tool.function.parameters).toEqual({});
	});

	it.each([
		{ label: "null", parameters: null },
		{ label: "0", parameters: 0 },
		{ label: "false", parameters: false },
		{ label: "empty string", parameters: "" },
	])("AI SDK parameters || {} ($label)", ({ parameters }) => {
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
	});

	it("truthy empty object and keyed object pass through OpenAI", () => {
		expect(
			(openai as any).functionDeclarationToOpenAiTool({
				name: "t",
				description: "d",
				parameters: {},
			}).function.parameters,
		).toEqual({});
		expect(
			(openai as any).functionDeclarationToOpenAiTool({
				name: "t",
				description: "d",
				parameters: {
					type: "object",
					properties: { "0": { type: "boolean" } },
				},
			}).function.parameters,
		).toEqual({
			type: "object",
			properties: { "0": { type: "boolean" } },
		});
	});
});
