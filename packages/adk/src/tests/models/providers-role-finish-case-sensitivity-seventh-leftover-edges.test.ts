import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
import { AnthropicLlm } from "../../models/anthropic-llm";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: {
			completions: {
				create: vi.fn(),
			},
		},
	})),
}));

vi.mock("@anthropic-ai/sdk", () => ({
	default: vi.fn(() => ({
		messages: {
			create: vi.fn(),
		},
	})),
}));

vi.mock("ai", () => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

function makeAiModel(modelId = "mock-model"): LanguageModel {
	return {
		modelId,
		provider: "mock",
		specificationVersion: "v2",
	} as unknown as LanguageModel;
}

describe("providers role/finishReason case-sensitivity seventh leftover (post #161/#165)", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let openai: OpenAiLlm;
	let anthropic: AnthropicLlm;
	let aiSdk: AiSdkLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		process.env.ANTHROPIC_API_KEY = "test-key";
		openai = new OpenAiLlm("gpt-4o-mini");
		anthropic = new AnthropicLlm("claude-3-5-sonnet");
		aiSdk = new AiSdkLlm(makeAiModel());
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		"MODEL",
		"ASSISTANT",
		"Model",
		"Assistant",
		"SYSTEM",
		"System",
	])("OpenAI toOpenAiRole(%j) falls through to user (case-sensitive)", (role) => {
		expect((openai as any).toOpenAiRole(role)).toBe("user");
	});

	it.each([
		"STOP",
		"Stop",
		"LENGTH",
		"Length",
		"TOOL_CALLS",
		"Tool_Calls",
	])("OpenAI toAdkFinishReason(%j) → FINISH_REASON_UNSPECIFIED", (reason) => {
		expect((openai as any).toAdkFinishReason(reason)).toBe(
			"FINISH_REASON_UNSPECIFIED",
		);
	});

	it.each([
		"MODEL",
		"ASSISTANT",
		"Model",
		"Assistant",
	])("Anthropic toAnthropicRole(%j) falls through to user", (role) => {
		expect((anthropic as any).toAnthropicRole(role)).toBe("user");
	});

	it.each([
		"END_TURN",
		"End_Turn",
		"STOP_SEQUENCE",
		"TOOL_USE",
		"MAX_TOKENS",
		"Max_Tokens",
	])("Anthropic toAdkFinishReason(%j) → FINISH_REASON_UNSPECIFIED", (reason) => {
		expect((anthropic as any).toAdkFinishReason(reason)).toBe(
			"FINISH_REASON_UNSPECIFIED",
		);
	});

	it.each([
		"MODEL",
		"ASSISTANT",
		"SYSTEM",
		"Model",
		"Assistant",
		"System",
	])("AiSdk mapRole(%j) → user (case-sensitive switch)", (role) => {
		expect((aiSdk as any).mapRole(role)).toBe("user");
	});

	it.each([
		"STOP",
		"Stop",
		"END_OF_MESSAGE",
		"LENGTH",
		"MAX_TOKENS",
		"Max_Tokens",
	])("AiSdk mapFinishReason(%j) → FINISH_REASON_UNSPECIFIED", (reason) => {
		expect((aiSdk as any).mapFinishReason(reason)).toBe(
			"FINISH_REASON_UNSPECIFIED",
		);
	});

	it("lowercase controls still map correctly across providers", () => {
		expect((openai as any).toOpenAiRole("model")).toBe("assistant");
		expect((openai as any).toAdkFinishReason("stop")).toBe("STOP");
		expect((anthropic as any).toAnthropicRole("model")).toBe("assistant");
		expect((anthropic as any).toAdkFinishReason("end_turn")).toBe("STOP");
		expect((aiSdk as any).mapRole("assistant")).toBe("assistant");
		expect((aiSdk as any).mapFinishReason("length")).toBe("MAX_TOKENS");
	});
});
