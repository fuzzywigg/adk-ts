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
 * Eighteenth leftover: AI SDK outbound keeps raw `toolCallId: functionResponse.id`
 * while OpenAI coalesces via `id || ""`. Sixteenth covered OpenAI-only FR id;
 * seventeenth covered functionCall id asymmetry — FR id cross-provider not done.
 */
describe("ai-sdk vs openai function-response id raw asymmetry eighteenth leftover edges", () => {
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
	])('AI SDK keeps raw falsy FR id ($label); OpenAI coalesces to ""', ({
		id,
	}) => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "user",
			parts: [{ functionResponse: { id, name: "fn", response: { ok: true } } }],
		});
		expect(aiMsg.content[0].toolCallId).toBe(id);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "user",
			parts: [{ functionResponse: { id, name: "fn", response: { ok: true } } }],
		});
		expect(openaiMsg.tool_call_id).toBe("");
	});

	it.each([
		{ label: "zero string", id: "0" },
		{ label: "whitespace", id: " " },
	])("truthy near-miss FR id kept on both providers ($label)", ({ id }) => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "user",
			parts: [{ functionResponse: { id, name: "fn", response: { ok: true } } }],
		});
		expect(aiMsg.content[0].toolCallId).toBe(id);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "user",
			parts: [{ functionResponse: { id, name: "fn", response: { ok: true } } }],
		});
		expect(openaiMsg.tool_call_id).toBe(id);
	});
});
