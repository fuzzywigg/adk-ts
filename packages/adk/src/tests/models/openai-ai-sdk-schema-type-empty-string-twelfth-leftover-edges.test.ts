import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
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

vi.mock("ai", () => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

function makeAiModel(): LanguageModel {
	return {
		modelId: "mock-model",
		provider: "mock",
		specificationVersion: "v2",
	} as unknown as LanguageModel;
}

/**
 * Twelfth leftover: `if (type && typeof type === "string")` skips `""`
 * so toLowerCase is never applied (stays ""). `"STRING"` still lowers.
 */
describe("openai/ai-sdk schema type empty-string twelfth leftover edges", () => {
	let openai: OpenAiLlm;
	let aiSdk: AiSdkLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		openai = new OpenAiLlm("gpt-4o-mini");
		aiSdk = new AiSdkLlm(makeAiModel());
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it('OpenAI leaves type: "" unchanged (falsy skip)', () => {
		expect((openai as any).transformSchemaForOpenAi({ type: "" })).toEqual({
			type: "",
		});
	});

	it('AI SDK leaves type: "" unchanged (falsy skip)', () => {
		expect((aiSdk as any).transformSchemaForAiSdk({ type: "" })).toEqual({
			type: "",
		});
	});

	it("OpenAI still lowercases STRING (control)", () => {
		expect(
			(openai as any).transformSchemaForOpenAi({ type: "STRING" }),
		).toEqual({ type: "string" });
	});

	it("AI SDK still lowercases STRING (control)", () => {
		expect((aiSdk as any).transformSchemaForAiSdk({ type: "STRING" })).toEqual({
			type: "string",
		});
	});

	it("nested properties type empty string is also skipped", () => {
		expect(
			(openai as any).transformSchemaForOpenAi({
				type: "OBJECT",
				properties: { a: { type: "" } },
			}),
		).toEqual({
			type: "object",
			properties: { a: { type: "" } },
		});
	});
});
