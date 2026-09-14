import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
 * Seventeenth leftover: OpenAI `tool_calls` → STOP; AI SDK `tool_calls` /
 * `tool-calls` → UNSPECIFIED (no tool case). Distinct from seventh case-
 * sensitivity leftovers.
 */
describe("openai vs ai-sdk tool-calls finish-reason asymmetry seventeenth leftover edges", () => {
	let openai: OpenAiLlm;
	let ai: AiSdkLlm;

	beforeEach(() => {
		process.env.OPENAI_API_KEY = "test-key";
		openai = new OpenAiLlm("gpt-4o-mini");
		ai = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
	});

	it('OpenAI "tool_calls" → STOP; AI SDK same → UNSPECIFIED', () => {
		expect((openai as any).toAdkFinishReason("tool_calls")).toBe("STOP");
		expect((ai as any).mapFinishReason("tool_calls")).toBe(
			"FINISH_REASON_UNSPECIFIED",
		);
	});

	it('AI SDK hyphen "tool-calls" also UNSPECIFIED', () => {
		expect((ai as any).mapFinishReason("tool-calls")).toBe(
			"FINISH_REASON_UNSPECIFIED",
		);
	});

	it.each([
		{ label: "stop", reason: "stop", expected: "STOP" },
		{ label: "end_of_message", reason: "end_of_message", expected: "STOP" },
		{ label: "length", reason: "length", expected: "MAX_TOKENS" },
		{ label: "max_tokens", reason: "max_tokens", expected: "MAX_TOKENS" },
	])("AI SDK still maps $label → $expected", ({ reason, expected }) => {
		expect((ai as any).mapFinishReason(reason)).toBe(expected);
	});

	it('OpenAI "length" → MAX_TOKENS; unknown → UNSPECIFIED', () => {
		expect((openai as any).toAdkFinishReason("length")).toBe("MAX_TOKENS");
		expect((openai as any).toAdkFinishReason("tool-calls")).toBe(
			"FINISH_REASON_UNSPECIFIED",
		);
	});
});
