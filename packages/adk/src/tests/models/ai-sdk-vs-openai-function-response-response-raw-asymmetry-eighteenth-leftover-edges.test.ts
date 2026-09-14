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
 * Eighteenth leftover (HEAVY tip-relaunch residual after #236): AI SDK formats
 * `functionResponse.response` via nullish / typeof branches (no `|| {}`), while
 * OpenAI uses `JSON.stringify(response || {})`. Twelfth covered OpenAI falsy
 * only; eleventh covered AI SDK empty-string vs nullish. Cross-provider
 * boolean-true / `-0` / `[]` / `-Infinity` residual was not on tip.
 */
describe("ai-sdk vs openai function-response response raw asymmetry eighteenth leftover edges", () => {
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
		{ label: "0", response: 0 as any },
		{ label: "false", response: false as any },
		{ label: "empty", response: "" },
		{ label: "null", response: null as any },
		{ label: "undefined", response: undefined },
	])("AI SDK keeps typed falsy FR response ($label); OpenAI coalesces to {}", ({
		response,
	}) => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "user",
			parts: [{ functionResponse: { id: "fr-1", name: "fn", response } }],
		});
		if (response === undefined || response === null) {
			expect(aiMsg.content[0].output).toEqual({
				type: "json",
				value: null,
			});
		} else if (typeof response === "string") {
			expect(aiMsg.content[0].output).toEqual({
				type: "text",
				value: response,
			});
		} else {
			expect(aiMsg.content[0].output).toEqual({
				type: "json",
				value: response,
			});
		}

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "user",
			parts: [{ functionResponse: { id: "fr-1", name: "fn", response } }],
		});
		expect(openaiMsg.content).toBe("{}");
	});

	it.each([
		{
			label: "boolean true",
			response: true as any,
			aiOutput: { type: "json", value: true },
			openaiContent: "true",
		},
		{
			label: "string true",
			response: "true",
			aiOutput: { type: "text", value: "true" },
			openaiContent: '"true"',
		},
		{
			label: "empty array",
			response: [] as any,
			aiOutput: { type: "json", value: [] },
			openaiContent: "[]",
		},
		{
			label: "NEGATIVE_INFINITY",
			response: Number.NEGATIVE_INFINITY as any,
			aiOutput: { type: "json", value: Number.NEGATIVE_INFINITY },
			openaiContent: "null",
		},
		{
			label: "zero string",
			response: "0",
			aiOutput: { type: "text", value: "0" },
			openaiContent: '"0"',
		},
		{
			label: "whitespace",
			response: " ",
			aiOutput: { type: "text", value: " " },
			openaiContent: '" "',
		},
	])("truthy near-miss FR response kept on both providers ($label)", ({
		response,
		aiOutput,
		openaiContent,
	}) => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "user",
			parts: [{ functionResponse: { id: "fr-1", name: "fn", response } }],
		});
		expect(aiMsg.content[0].output).toEqual(aiOutput);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "user",
			parts: [{ functionResponse: { id: "fr-1", name: "fn", response } }],
		});
		expect(openaiMsg.content).toBe(openaiContent);
	});

	it("AI SDK keeps raw -0 FR response; OpenAI SameValueZero-collapses to {}", () => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: "fr-1",
						name: "fn",
						response: -0 as any,
					},
				},
			],
		});
		expect(aiMsg.content[0].output.type).toBe("json");
		expect(Object.is(aiMsg.content[0].output.value, -0)).toBe(true);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: "fr-1",
						name: "fn",
						response: -0 as any,
					},
				},
			],
		});
		expect(openaiMsg.content).toBe("{}");
	});
});
