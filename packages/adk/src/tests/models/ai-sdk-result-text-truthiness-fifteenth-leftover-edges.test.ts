import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
import { LlmRequest } from "../../models/llm-request";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

const { generateText, streamText } = vi.hoisted(() => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
}));

vi.mock("ai", () => ({
	generateText,
	streamText,
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

/**
 * Fifteenth leftover: `if (result.text)` / `if (accumulatedText)` — empty
 * string skips the text part (placeholder `[{ text: "" }]` still applied when
 * no tool calls); whitespace / "0" are pushed.
 */
describe("ai-sdk result text truthiness fifteenth leftover edges", () => {
	let llm: AiSdkLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
	});

	it.each([
		{ label: "empty", text: "", expectPlaceholder: true },
		{ label: "whitespace", text: " ", expectPlaceholder: false },
		{ label: "zero string", text: "0", expectPlaceholder: false },
	])("non-stream result.text ($label)", async ({ text, expectPlaceholder }) => {
		generateText.mockResolvedValue({
			text,
			toolCalls: [],
			usage: undefined,
			finishReason: "stop",
		});
		const out: any[] = [];
		for await (const resp of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			false,
		)) {
			out.push(resp);
		}
		expect(out).toHaveLength(1);
		if (expectPlaceholder) {
			expect(out[0].content.parts).toEqual([{ text: "" }]);
		} else {
			expect(out[0].content.parts).toEqual([{ text }]);
		}
	});

	it("stream accumulatedText empty yields placeholder final parts", async () => {
		streamText.mockReturnValue({
			textStream: (async function* () {
				/* no deltas */
			})(),
			toolCalls: Promise.resolve([]),
			usage: Promise.resolve(undefined),
			finishReason: Promise.resolve("stop"),
		});
		const out: any[] = [];
		for await (const resp of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		)) {
			out.push(resp);
		}
		const final = out[out.length - 1];
		expect(final.content.parts).toEqual([{ text: "" }]);
		expect(final.turnComplete).toBe(true);
	});

	it("stream accumulatedText whitespace is pushed (no placeholder)", async () => {
		streamText.mockReturnValue({
			textStream: (async function* () {
				yield " ";
			})(),
			toolCalls: Promise.resolve([]),
			usage: Promise.resolve(undefined),
			finishReason: Promise.resolve("stop"),
		});
		const out: any[] = [];
		for await (const resp of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		)) {
			out.push(resp);
		}
		const final = out[out.length - 1];
		expect(final.content.parts).toEqual([{ text: " " }]);
	});
});
