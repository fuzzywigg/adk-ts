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
 * Seventeenth leftover: AI SDK outbound keeps raw `toolCallId: functionCall.id`
 * while OpenAI outbound coalesces via `id || ""`. Parallel to sixteenth
 * description asymmetry; distinct from sixteenth inbound stream/nonstream id.
 */
describe("ai-sdk vs openai function-call id raw asymmetry seventeenth leftover edges", () => {
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
		{ label: "0", id: 0 as any },
		{ label: "false", id: false as any },
		{ label: "empty", id: "" },
		{ label: "null", id: null as any },
		{ label: "undefined", id: undefined },
	])('AI SDK keeps raw falsy id ($label); OpenAI coalesces to ""', ({ id }) => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id, name: "fn", args: {} } }],
		});
		expect(aiMsg.content[0].toolCallId).toBe(id);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id, name: "fn", args: {} } }],
		});
		expect(openaiMsg.tool_calls[0].id).toBe("");
	});

	it.each([
		{ label: "zero string", id: "0" },
		{ label: "whitespace", id: " " },
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
});
