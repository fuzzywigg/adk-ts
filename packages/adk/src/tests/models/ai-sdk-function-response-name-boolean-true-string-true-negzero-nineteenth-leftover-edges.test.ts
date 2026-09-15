import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
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

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #261; lands closed #252):
 * `name || "unknown"`. Fourteenth pinned classic falsy + `"0"` / whitespace.
 * Residual boolean `true` / `"true"` / `[]` / `-Infinity` keep; SameValueZero
 * `-0` falls back to `"unknown"`.
 */
describe("ai-sdk function-response name boolean-true/string-true/negzero nineteenth leftover edges", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		llm = new AiSdkLlm(makeAiModel());
	});

	it.each([
		{ label: "boolean true", name: true as any, expected: true },
		{ label: "string true", name: "true", expected: "true" },
		{ label: "empty array", name: [] as any, expected: [] },
		{
			label: "NEGATIVE_INFINITY",
			name: Number.NEGATIVE_INFINITY as any,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "-0", name: -0 as any, expected: "unknown" },
	])('toolName name || "unknown" ($label)', ({ name, expected }) => {
		const message = (llm as any).contentToAiSdkMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: "fr-1",
						name,
						response: { ok: true },
					},
				},
			],
		});
		expect(message.content[0].toolName).toEqual(expected);
		if (Object.is(name, -0)) {
			expect(message.content[0].toolName).toBe("unknown");
		}
	});
});
