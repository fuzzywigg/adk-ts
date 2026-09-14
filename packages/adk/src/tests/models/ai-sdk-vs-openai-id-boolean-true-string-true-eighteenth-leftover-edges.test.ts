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
 * Eighteenth leftover: AI SDK raw id vs OpenAI `id || ""` residual after
 * seventeenth falsy matrix. Boolean `true` / string `"true"` / `[]` /
 * `NEGATIVE_INFINITY` kept on both; `-0` coalesces only on OpenAI.
 */
describe("ai-sdk vs openai id boolean-true string-true eighteenth leftover edges", () => {
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
		{ label: "boolean true", id: true as any },
		{ label: "string true", id: "true" },
		{ label: "empty array", id: [] as any },
		{ label: "NEGATIVE_INFINITY", id: Number.NEGATIVE_INFINITY as any },
	])("truthy near-miss id kept on both providers ($label)", ({ id }) => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id, name: "fn", args: {} } }],
		});
		expect(aiMsg.content[0].toolCallId).toBe(id);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id, name: "fn", args: {} } }],
		});
		expect(openaiMsg.tool_calls[0].id).toBe(id);
	});

	it('AI SDK keeps raw -0; OpenAI coalesces -0 to ""', () => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: -0 as any, name: "fn", args: {} } }],
		});
		expect(Object.is(aiMsg.content[0].toolCallId, -0)).toBe(true);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: -0 as any, name: "fn", args: {} } }],
		});
		expect(openaiMsg.tool_calls[0].id).toBe("");
	});
});
