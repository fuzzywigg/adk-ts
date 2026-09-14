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
 * Seventeenth leftover: AI SDK maps every functionCall part; OpenAI `.find`
 * keeps first only. Distinct from fifteenth tools[] index all-vs-zero.
 */
describe("ai-sdk all function-calls vs openai find-first seventeenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let ai: AiSdkLlm;
	let openai: OpenAiLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		ai = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
		openai = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it("two functionCall parts → AI SDK two tool-calls; OpenAI one", () => {
		const content = {
			role: "model",
			parts: [
				{ functionCall: { id: "a", name: "first", args: { n: 1 } } },
				{ functionCall: { id: "b", name: "second", args: { n: 2 } } },
			],
		};

		const aiMsg = (ai as any).contentToAiSdkMessage(content);
		expect(aiMsg.content).toHaveLength(2);
		expect(aiMsg.content[0]).toMatchObject({
			type: "tool-call",
			toolName: "first",
			toolCallId: "a",
		});
		expect(aiMsg.content[1]).toMatchObject({
			type: "tool-call",
			toolName: "second",
			toolCallId: "b",
		});

		const oa = (openai as any).contentToOpenAiMessage(content);
		expect(oa.tool_calls).toHaveLength(1);
		expect(oa.tool_calls[0].id).toBe("a");
		expect(oa.tool_calls[0].function.name).toBe("first");
	});

	it("text + later functionCall: AI SDK keeps both; OpenAI find still first FC only", () => {
		const content = {
			role: "model",
			parts: [
				{ text: "prelude" },
				{ functionCall: { id: "c", name: "only", args: {} } },
			],
		};
		const aiMsg = (ai as any).contentToAiSdkMessage(content);
		expect(aiMsg.content.map((p: any) => p.type)).toEqual([
			"text",
			"tool-call",
		]);

		const oa = (openai as any).contentToOpenAiMessage(content);
		expect(oa.tool_calls).toHaveLength(1);
		expect(oa.content).toBeUndefined();
	});
});
