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
 * AI SDK raw vs OpenAI `args || {}` / `id || ""` — boxed-falsy /
 * `"-Infinity"` / `-1` keep on both (JSON asymmetries for boxed wrappers).
 */
describe("ai-sdk vs openai args/id object-false/zero/empty nineteenth residual deepen", () => {
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

	it('Object("") args kept; OpenAI JSON ""', () => {
		const boxed = Object("");
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: boxed as any } }],
		});
		expect(aiMsg.content[0].input).toBe(boxed);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: boxed as any } }],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toBe("");
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
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toBeNull();
	});

	it('string "-Infinity" args kept; OpenAI JSON "-Infinity"', () => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [
				{ functionCall: { id: "c1", name: "fn", args: "-Infinity" as any } },
			],
		});
		expect(aiMsg.content[0].input).toBe("-Infinity");

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [
				{ functionCall: { id: "c1", name: "fn", args: "-Infinity" as any } },
			],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toBe(
			"-Infinity",
		);
	});

	it("number -1 args kept; OpenAI JSON -1", () => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: -1 as any } }],
		});
		expect(aiMsg.content[0].input).toBe(-1);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: -1 as any } }],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toBe(-1);
	});

	it.each([
		{ label: "Object(false)", value: Object(false) },
		{ label: "Object(0)", value: Object(0) },
		{ label: 'Object("")', value: Object("") },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "number -1", value: -1 },
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
