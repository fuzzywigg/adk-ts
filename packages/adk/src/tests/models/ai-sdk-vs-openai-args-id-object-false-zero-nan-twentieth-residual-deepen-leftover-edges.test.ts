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
 * AI SDK raw vs OpenAI `args || {}` / `id || ""` —
 * boxed falsy `Object(false)` / `Object(0)` / `Object(NaN)` keep on both
 * (JSON asymmetries: false / 0 / null).
 */
describe("ai-sdk vs openai args/id object-false/zero/nan twentieth residual deepen", () => {
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

	it("Object(false) args kept; OpenAI JSON false", () => {
		const boxed = Object(false);
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: boxed as any } }],
		});
		expect(aiMsg.content[0].input).toBe(boxed);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: boxed as any } }],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toBe(false);
	});

	it("Object(0) args kept; OpenAI JSON 0", () => {
		const boxed = Object(0);
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: boxed as any } }],
		});
		expect(aiMsg.content[0].input).toBe(boxed);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: boxed as any } }],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toBe(0);
	});

	it("Object(NaN) args kept; OpenAI JSON null", () => {
		const boxed = Object(Number.NaN);
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: boxed as any } }],
		});
		expect(aiMsg.content[0].input).toBe(boxed);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: boxed as any } }],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toBe(null);
	});

	it.each([
		{ label: "Object(false)", value: Object(false) },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("$label id kept on both providers", ({ value }) => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: value as any, name: "fn", args: {} } }],
		});
		expect(aiMsg.content[0].toolCallId).toBe(value);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: value as any, name: "fn", args: {} } }],
		});
		expect(openaiMsg.tool_calls[0].id).toBe(value);
	});
});
