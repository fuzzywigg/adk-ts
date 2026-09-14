import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";

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

function makeAiModel(modelId = "mock-model"): LanguageModel {
	return {
		modelId,
		provider: "mock",
		specificationVersion: "v2",
	} as unknown as LanguageModel;
}

describe("AiSdkLlm empty-stream sixth leftover edges (post #150)", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		jsonSchema.mockImplementation((schema: unknown) => ({ schema }));
		llm = new AiSdkLlm(makeAiModel("sixth-model"));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	async function drain(
		gen: AsyncGenerator<LlmResponse, void, unknown>,
	): Promise<LlmResponse[]> {
		const out: LlmResponse[] = [];
		for await (const item of gen) {
			out.push(item);
		}
		return out;
	}

	function baseRequest(overrides: Record<string, unknown> = {}) {
		return new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
			...overrides,
		});
	}

	it("stream with no deltas, empty toolCalls, and falsy usage yields blank text part only", async () => {
		streamText.mockReturnValue({
			textStream: (async function* () {
				/* no deltas */
			})(),
			toolCalls: Promise.resolve([]),
			usage: Promise.resolve(undefined),
			finishReason: Promise.resolve("stop"),
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), true),
		);

		expect(responses).toHaveLength(1);
		expect(responses[0].partial).toBeUndefined();
		expect(responses[0].content?.parts).toEqual([{ text: "" }]);
		expect(responses[0].usageMetadata).toBeUndefined();
		expect(responses[0].finishReason).toBe("STOP");
		expect(responses[0].turnComplete).toBe(true);
	});

	it.each([
		{ label: "null toolCalls", toolCalls: null },
		{ label: "undefined toolCalls", toolCalls: undefined },
	])("stream empty text with $label still falls back to blank text part", async ({
		toolCalls,
	}) => {
		streamText.mockReturnValue({
			textStream: (async function* () {
				/* empty */
			})(),
			toolCalls: Promise.resolve(toolCalls),
			usage: Promise.resolve(null),
			finishReason: Promise.resolve("stop"),
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), true),
		);

		expect(responses).toHaveLength(1);
		expect(responses[0].content?.parts).toEqual([{ text: "" }]);
		expect(responses[0].usageMetadata).toBeUndefined();
		expect(responses[0].turnComplete).toBe(true);
	});

	it("stream empty text + empty toolCalls + zeroed usage still emits usageMetadata", async () => {
		streamText.mockReturnValue({
			textStream: (async function* () {
				/* empty */
			})(),
			toolCalls: Promise.resolve([]),
			usage: Promise.resolve({
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: 0,
			}),
			finishReason: Promise.resolve("stop"),
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), true),
		);

		expect(responses).toHaveLength(1);
		expect(responses[0].content?.parts).toEqual([{ text: "" }]);
		expect(responses[0].usageMetadata).toEqual({
			promptTokenCount: 0,
			candidatesTokenCount: 0,
			totalTokenCount: 0,
		});
	});

	it("stream maps unknown finishReason while keeping blank parts fallback", async () => {
		streamText.mockReturnValue({
			textStream: (async function* () {
				/* empty */
			})(),
			toolCalls: Promise.resolve([]),
			usage: Promise.resolve(undefined),
			finishReason: Promise.resolve("other"),
		});

		const responses = await drain(
			(llm as any).generateContentAsyncImpl(baseRequest(), true),
		);

		expect(responses[0].content?.parts).toEqual([{ text: "" }]);
		expect(responses[0].finishReason).toBe("FINISH_REASON_UNSPECIFIED");
		expect(responses[0].usageMetadata).toBeUndefined();
	});

	it("transformSchemaForAiSdk leaves non-string type unchanged like OpenAI", () => {
		const schema = { type: 42, properties: { a: { type: true } } };
		const transformed = (llm as any).transformSchemaForAiSdk(schema);
		expect(transformed.type).toBe(42);
		expect(transformed.properties.a.type).toBe(true);
	});
});
