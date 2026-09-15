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
 * Nineteenth leftover residual deepen (complements #269 args/id NaN/posinf):
 * AI SDK raw vs OpenAI `args || {}` / `id || ""` —
 * `Object(true)` / `1` / `"Infinity"` / `{}` keep on both (JSON asymmetries).
 */
describe("ai-sdk vs openai args/id object-true/one/infinity nineteenth residual deepen", () => {
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

	it("Object(true) args kept; OpenAI JSON true", () => {
		const boxed = Object(true);
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: boxed as any } }],
		});
		expect(aiMsg.content[0].input).toBe(boxed);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: boxed as any } }],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toBe(true);
	});

	it("number 1 args kept; OpenAI JSON 1", () => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: 1 as any } }],
		});
		expect(aiMsg.content[0].input).toBe(1);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: 1 as any } }],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toBe(1);
	});

	it('string "Infinity" args kept; OpenAI JSON "Infinity"', () => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [
				{ functionCall: { id: "c1", name: "fn", args: "Infinity" as any } },
			],
		});
		expect(aiMsg.content[0].input).toBe("Infinity");

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [
				{ functionCall: { id: "c1", name: "fn", args: "Infinity" as any } },
			],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toBe(
			"Infinity",
		);
	});

	it("empty object {} args kept by identity on both", () => {
		const empty = {};
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: empty as any } }],
		});
		expect(aiMsg.content[0].input).toBe(empty);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: empty as any } }],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toEqual({});
	});

	it.each([
		{ label: "Object(true)", value: Object(true) },
		{ label: "number 1", value: 1 },
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "empty object", value: {} },
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
