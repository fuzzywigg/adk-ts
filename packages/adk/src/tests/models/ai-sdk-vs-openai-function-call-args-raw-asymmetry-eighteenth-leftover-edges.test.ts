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
 * Eighteenth leftover (HEAVY tip-relaunch residual after #236): AI SDK outbound
 * keeps raw `input: functionCall.args` while OpenAI coalesces via `args || {}`
 * then JSON.stringify. Fifteenth covered OpenAI-only falsy args; seventeenth
 * covered id asymmetry only. Pins boolean `true` / `"true"` / `[]` /
 * `NEGATIVE_INFINITY` keep vs SameValueZero `-0` OpenAI collapse.
 */
describe("ai-sdk vs openai function-call args raw asymmetry eighteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let openai: OpenAiLlm;
	let aiSdk: AiSdkLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		openai = new OpenAiLlm();
		aiSdk = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it.each([
		{ label: "0", args: 0 as any },
		{ label: "false", args: false as any },
		{ label: "empty", args: "" as any },
		{ label: "null", args: null as any },
		{ label: "undefined", args: undefined },
	])("AI SDK keeps raw falsy args ($label); OpenAI coalesces to {}", ({
		args,
	}) => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args } }],
		});
		expect(aiMsg.content[0].input).toBe(args);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args } }],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toEqual({});
	});

	it.each([
		{ label: "zero string", args: "0" as any },
		{ label: "whitespace", args: " " as any },
		{ label: "boolean true", args: true as any },
		{ label: "string true", args: "true" as any },
		{ label: "empty array", args: [] as any },
		{ label: "NEGATIVE_INFINITY", args: Number.NEGATIVE_INFINITY as any },
	])("truthy near-miss args kept on both providers ($label)", ({ args }) => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args } }],
		});
		expect(aiMsg.content[0].input).toBe(args);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args } }],
		});
		const parsed = JSON.parse(openaiMsg.tool_calls[0].function.arguments);
		if (Object.is(args, Number.NEGATIVE_INFINITY)) {
			expect(parsed).toBeNull();
		} else {
			expect(parsed).toEqual(args);
		}
	});

	it("AI SDK keeps raw -0; OpenAI SameValueZero-collapses -0 to {}", () => {
		const aiMsg = (aiSdk as any).contentToAiSdkMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: -0 as any } }],
		});
		expect(Object.is(aiMsg.content[0].input, -0)).toBe(true);

		const openaiMsg = (openai as any).contentToOpenAiMessage({
			role: "model",
			parts: [{ functionCall: { id: "c1", name: "fn", args: -0 as any } }],
		});
		expect(JSON.parse(openaiMsg.tool_calls[0].function.arguments)).toEqual({});
	});
});
