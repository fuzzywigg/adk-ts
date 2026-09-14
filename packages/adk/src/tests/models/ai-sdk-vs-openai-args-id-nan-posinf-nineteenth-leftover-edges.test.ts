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
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip 96457a9 / #248):
 * AI SDK raw `args`/`id` vs OpenAI `args || {}` / `id || ""` after eighteenth
 * true/`"true"`/`[]`/`-Infinity`/`-0`. `NaN` OpenAI-collapses; `POSITIVE_INFINITY`
 * kept on both (JSON null for Infinity args).
 */
describe("ai-sdk vs openai args/id nan posinf nineteenth leftover edges", () => {
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

	it("AI SDK keeps raw NaN args; OpenAI coalesces NaN to {}", () => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [
				{ functionCall: { id: "c1", name: "fn", args: Number.NaN as any } },
			],
		});
		expect(Number.isNaN(aiMsg.content[0].input)).toBe(true);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [
				{ functionCall: { id: "c1", name: "fn", args: Number.NaN as any } },
			],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toEqual({});
	});

	it("POSITIVE_INFINITY args kept on AI SDK; OpenAI JSON null", () => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [
				{
					functionCall: {
						id: "c1",
						name: "fn",
						args: Number.POSITIVE_INFINITY as any,
					},
				},
			],
		});
		expect(aiMsg.content[0].input).toBe(Number.POSITIVE_INFINITY);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [
				{
					functionCall: {
						id: "c1",
						name: "fn",
						args: Number.POSITIVE_INFINITY as any,
					},
				},
			],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toBeNull();
	});

	it('AI SDK keeps raw NaN id; OpenAI coalesces NaN to ""', () => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [
				{ functionCall: { id: Number.NaN as any, name: "fn", args: {} } },
			],
		});
		expect(Number.isNaN(aiMsg.content[0].toolCallId)).toBe(true);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [
				{ functionCall: { id: Number.NaN as any, name: "fn", args: {} } },
			],
		});
		expect(openaiMsg.tool_calls[0].id).toBe("");
	});

	it("POSITIVE_INFINITY id kept on both providers", () => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [
				{
					functionCall: {
						id: Number.POSITIVE_INFINITY as any,
						name: "fn",
						args: {},
					},
				},
			],
		});
		expect(aiMsg.content[0].toolCallId).toBe(Number.POSITIVE_INFINITY);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [
				{
					functionCall: {
						id: Number.POSITIVE_INFINITY as any,
						name: "fn",
						args: {},
					},
				},
			],
		});
		expect(openaiMsg.tool_calls[0].id).toBe(Number.POSITIVE_INFINITY);
	});
});
