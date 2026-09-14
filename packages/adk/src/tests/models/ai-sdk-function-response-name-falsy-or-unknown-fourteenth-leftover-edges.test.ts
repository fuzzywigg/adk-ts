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
 * Fourteenth leftover: `name || "unknown"` — eleventh leftover pinned "" and
 * whitespace. 0 / false also fall back; "0" stays.
 */
describe("ai-sdk function-response name falsy or-unknown fourteenth leftover edges", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		llm = new AiSdkLlm(makeAiModel());
	});

	it.each([
		{ label: "0", name: 0 as any, expected: "unknown" },
		{ label: "false", name: false as any, expected: "unknown" },
		{ label: "null", name: null as any, expected: "unknown" },
		{ label: "undefined", name: undefined, expected: "unknown" },
		{ label: "empty", name: "", expected: "unknown" },
		{ label: "zero string", name: "0", expected: "0" },
		{ label: "whitespace", name: " ", expected: " " },
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
		expect(message.content[0].toolName).toBe(expected);
	});
});
