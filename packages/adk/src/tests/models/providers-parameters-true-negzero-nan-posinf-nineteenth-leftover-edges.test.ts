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
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #258):
 * `parameters || {}` after sixteenth classic falsy. Residual true/`"true"`/`-0`/
 * `NaN`/`±Infinity` keep-or-coalesce; empty `[]` bypasses `|| {}` but
 * `transformSchema*.map` remaps to a new array.
 */
describe("providers parameters true negzero nan posinf nineteenth leftover edges", () => {
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
		{ label: "-0", parameters: -0 as any },
		{ label: "NaN", parameters: Number.NaN as any },
	])("OpenAI/AI SDK parameters || {} ($label)", ({ parameters }) => {
		expect(
			(openai as any).functionDeclarationToOpenAiTool({
				name: "t",
				description: "d",
				parameters,
			}).function.parameters,
		).toEqual({});

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

	it.each([
		{ label: "boolean true", parameters: true as any },
		{ label: "string true", parameters: "true" as any },
		{ label: "POSITIVE_INFINITY", parameters: Number.POSITIVE_INFINITY as any },
		{ label: "NEGATIVE_INFINITY", parameters: Number.NEGATIVE_INFINITY as any },
	])("truthy non-array near-miss parameters kept by identity ($label)", ({
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

	it("empty array parameters bypass || {} but transformSchema.map remaps", () => {
		const parameters: any[] = [];
		const openaiParams = (openai as any).functionDeclarationToOpenAiTool({
			name: "t",
			description: "d",
			parameters,
		}).function.parameters;
		expect(openaiParams).toEqual([]);
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
		expect(tools.t.inputSchema).toEqual({ schema: [] });
		expect(tools.t.inputSchema.schema).not.toBe(parameters);
	});
});
