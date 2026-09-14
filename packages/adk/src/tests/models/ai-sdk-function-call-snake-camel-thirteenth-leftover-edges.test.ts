import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
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
 * Thirteenth leftover: contentToAiSdkMessage only inspects camel functionCall /
 * functionResponse. Snake-only parts fall through to the text collector → null.
 */
describe("ai-sdk functionCall snake vs camel thirteenth leftover edges", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		llm = new AiSdkLlm(makeAiModel());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("snake function_call-only part returns null (no text collected)", () => {
		const message = (llm as any).contentToAiSdkMessage({
			role: "assistant",
			parts: [
				{
					function_call: { id: "c1", name: "search", args: { q: "x" } },
				},
			],
		});
		expect(message).toBeNull();
	});

	it("camel functionCall becomes tool-call (control)", () => {
		const message = (llm as any).contentToAiSdkMessage({
			role: "assistant",
			parts: [
				{
					functionCall: { id: "c1", name: "search", args: { q: "x" } },
				},
			],
		});
		expect(message.role).toBe("assistant");
		expect(message.content).toEqual([
			{
				type: "tool-call",
				toolCallId: "c1",
				toolName: "search",
				input: { q: "x" },
			},
		]);
	});

	it("snake function_response-only part returns null", () => {
		const message = (llm as any).contentToAiSdkMessage({
			role: "user",
			parts: [
				{
					function_response: {
						id: "fr-1",
						name: "tool",
						response: { ok: true },
					},
				},
			],
		});
		expect(message).toBeNull();
	});

	it("camel functionResponse with empty-string response is still tool-result text", () => {
		const message = (llm as any).contentToAiSdkMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: "fr-1",
						name: "tool",
						response: "",
					},
				},
			],
		});
		expect(message.role).toBe("tool");
		expect(message.content[0].output).toEqual({ type: "text", value: "" });
	});
});
