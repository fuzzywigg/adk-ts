import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "ai";
import { AiSdkLlm } from "../../models/ai-sdk";
import { LlmRequest } from "../../models/llm-request";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

const generateText = vi.fn();
const streamText = vi.fn();
const jsonSchema = vi.fn((schema: unknown) => ({ schema }));

vi.mock("ai", () => ({
	generateText: (...args: unknown[]) => generateText(...args),
	streamText: (...args: unknown[]) => streamText(...args),
	jsonSchema: (...args: unknown[]) => jsonSchema(...args),
}));

function makeModel(modelId = "mock-model"): LanguageModel {
	return {
		modelId,
		provider: "mock",
		specificationVersion: "v2",
	} as unknown as LanguageModel;
}

describe("AiSdkLlm leftover edges (TOKENMAXX post #124)", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new AiSdkLlm(makeModel());
		generateText.mockResolvedValue({
			text: "ok",
			finishReason: "stop",
			usage: { promptTokens: 1, completionTokens: 1 },
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("convertToAiSdkMessages treats nullish contents as empty via || []", () => {
		const request = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
		});
		(request as any).contents = null;
		expect((llm as any).convertToAiSdkMessages(request)).toEqual([]);

		(request as any).contents = undefined;
		expect((llm as any).convertToAiSdkMessages(request)).toEqual([]);
	});

	it("generateContentAsyncImpl still runs with nullish contents", async () => {
		const request = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
		});
		(request as any).contents = undefined;

		const responses = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			request,
			false,
		)) {
			responses.push(response);
		}

		expect(generateText).toHaveBeenCalledWith(
			expect.objectContaining({ messages: [] }),
		);
		expect(responses.length).toBeGreaterThan(0);
	});
});
