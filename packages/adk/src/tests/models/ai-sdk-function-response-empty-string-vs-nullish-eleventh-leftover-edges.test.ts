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
 * Eleventh leftover: functionResponse.response === undefined|null → json
 * null; empty string takes text branch. name || "unknown" for "".
 */
describe("ai-sdk function-response empty-string vs nullish eleventh leftover edges", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		llm = new AiSdkLlm(makeAiModel());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("empty-string response becomes text output not json-null", () => {
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
		expect(message).toEqual({
			role: "tool",
			content: [
				{
					type: "tool-result",
					toolCallId: "fr-1",
					toolName: "tool",
					output: { type: "text", value: "" },
				},
			],
		});
	});

	it.each([
		{ label: "null", response: null },
		{ label: "undefined", response: undefined },
	])("$label response becomes json null (control)", ({ response }) => {
		const message = (llm as any).contentToAiSdkMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: "fr-2",
						name: "tool",
						response,
					},
				},
			],
		});
		expect(message.content[0].output).toEqual({ type: "json", value: null });
	});

	it('empty-string name falls back to "unknown" via ||', () => {
		const message = (llm as any).contentToAiSdkMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: "fr-3",
						name: "",
						response: { ok: true },
					},
				},
			],
		});
		expect(message.content[0].toolName).toBe("unknown");
		expect(message.content[0].output).toEqual({
			type: "json",
			value: { ok: true },
		});
	});

	it("whitespace-only name is kept (truthy, no unknown fallback)", () => {
		const message = (llm as any).contentToAiSdkMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: "fr-4",
						name: " ",
						response: "hi",
					},
				},
			],
		});
		expect(message.content[0].toolName).toBe(" ");
		expect(message.content[0].output).toEqual({ type: "text", value: "hi" });
	});
});
