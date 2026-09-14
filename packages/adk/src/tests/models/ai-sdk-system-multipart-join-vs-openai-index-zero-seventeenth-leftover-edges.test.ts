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
 * Seventeenth leftover: AI SDK system multi-text joins all parts; OpenAI
 * system uses parts[0] only (#219). This pins the reverse join asymmetry.
 */
describe("ai-sdk system multipart join vs openai index-zero seventeenth leftover edges", () => {
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

	it('system parts ["A","B"] → AI SDK "AB"; OpenAI "A"', () => {
		const content = {
			role: "system",
			parts: [{ text: "A" }, { text: "B" }],
		};
		const aiMsg = (ai as any).contentToAiSdkMessage(content);
		expect(aiMsg).toEqual({ role: "system", content: "AB" });

		const oa = (openai as any).contentToOpenAiMessage(content);
		expect(oa).toEqual({ role: "system", content: "A" });
	});

	it("system with falsy middle text: AI SDK skips falsy via if(part.text); OpenAI still [0]", () => {
		const content = {
			role: "system",
			parts: [{ text: "A" }, { text: "" }, { text: "C" }],
		};
		const aiMsg = (ai as any).contentToAiSdkMessage(content);
		expect(aiMsg).toEqual({ role: "system", content: "AC" });

		const oa = (openai as any).contentToOpenAiMessage(content);
		expect(oa).toEqual({ role: "system", content: "A" });
	});

	it('system single part still matches both as "solo"', () => {
		const content = {
			role: "system",
			parts: [{ text: "solo" }],
		};
		expect((ai as any).contentToAiSdkMessage(content).content).toBe("solo");
		expect((openai as any).contentToOpenAiMessage(content).content).toBe(
			"solo",
		);
	});
});
