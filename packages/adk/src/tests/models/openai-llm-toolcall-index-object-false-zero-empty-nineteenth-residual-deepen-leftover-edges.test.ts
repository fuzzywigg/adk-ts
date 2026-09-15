import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
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

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `toolCall.index || 0` — `Object(0)` ToStrings to `"0"` and emits; other
 * boxed-falsy / `"-Infinity"` / `-1` orphan from array `for-of`.
 */
describe("openai-llm toolCall.index object-false/zero/empty nineteenth residual deepen", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;
	let mockCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		mockCreate = vi.fn();
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		}));
		llm = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	async function drain(
		req: LlmRequest,
		stream = false,
	): Promise<LlmResponse[]> {
		const out: LlmResponse[] = [];
		for await (const response of (llm as any).generateContentAsyncImpl(
			req,
			stream,
		)) {
			out.push(response);
		}
		return out;
	}

	function baseRequest() {
		return new LlmRequest({
			model: "gpt-4o",
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		});
	}

	it("Object(0) ToStrings to index 0 and emits tool call", async () => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: Object(0),
										id: "call-0",
										function: { name: "alpha", arguments: "{}" },
									},
								],
							},
							finish_reason: "tool_calls",
						},
					],
				};
			})(),
		);

		const responses = await drain(baseRequest(), true);
		const final = responses.find((r) => r.finishReason != null);
		const names =
			final?.content?.parts
				?.map((p: any) => p.functionCall?.name)
				.filter(Boolean) ?? [];
		expect(names).toContain("alpha");
	});

	it.each([
		{ label: "Object(false)", index: Object(false) },
		{ label: 'Object("")', index: Object("") },
		{ label: "Object(NaN)", index: Object(Number.NaN) },
		{ label: 'string "-Infinity"', index: "-Infinity" },
		{ label: "number -1", index: -1 },
	])("truthy non-index $label orphans tool call from for-of", async ({
		index,
	}) => {
		mockCreate.mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index,
										id: "call-orphan",
										function: { name: "ghost", arguments: "{}" },
									},
								],
							},
							finish_reason: null,
						},
					],
				};
				yield {
					choices: [
						{
							delta: {},
							finish_reason: "tool_calls",
						},
					],
				};
			})(),
		);

		const responses = await drain(baseRequest(), true);
		const final = responses.find((r) => r.finishReason != null);
		const names =
			final?.content?.parts
				?.map((p: any) => p.functionCall?.name)
				.filter(Boolean) ?? [];
		expect(names).not.toContain("ghost");
	});
});
