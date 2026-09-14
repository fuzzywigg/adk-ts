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
 * Eighteenth leftover (HEAVY tip-relaunch residual after #236): AI SDK outbound
 * keeps raw `toolCallId: functionResponse.id` while OpenAI coalesces via
 * `id || ""`. Sixteenth covered OpenAI-only FR id; seventeenth + #236 covered
 * functionCall id asymmetry (incl. boolean-true keep). FR id cross-provider
 * boolean-true / `-0` residual was not on tip.
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
		{ label: "boolean true", id: true as any },
		{ label: "string true", id: "true" },
		{ label: "empty array", id: [] as any },
		{ label: "NEGATIVE_INFINITY", id: Number.NEGATIVE_INFINITY as any },
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

	it('AI SDK keeps raw -0 FR id; OpenAI coalesces -0 to ""', () => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: -0 as any,
						name: "fn",
						response: { ok: true },
					},
				},
			],
		});
		expect(Object.is(aiMsg.content[0].toolCallId, -0)).toBe(true);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: -0 as any,
						name: "fn",
						response: { ok: true },
					},
				},
			],
		});
		expect(openaiMsg.tool_call_id).toBe("");
	});
});
