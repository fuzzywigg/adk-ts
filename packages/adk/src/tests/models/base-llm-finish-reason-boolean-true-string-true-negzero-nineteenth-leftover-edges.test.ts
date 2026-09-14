import { BaseLlm, type LlmRequest, type LlmResponse } from "@adk/models";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSetAttributes, mockTracer } = vi.hoisted(() => {
	const mockSetAttributes = vi.fn();
	const mockSpan = {
		setAttributes: mockSetAttributes,
		recordException: vi.fn(),
		setStatus: vi.fn(),
		end: vi.fn(),
	};
	const mockTracer = {
		startActiveSpan: vi.fn(
			(_name: string, fn: (span: typeof mockSpan) => unknown) => fn(mockSpan),
		),
	};
	return { mockSetAttributes, mockTracer };
});

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

vi.mock("../../telemetry", () => ({
	tracer: mockTracer,
}));

class UsageLlm extends BaseLlm {
	constructor(
		model: string,
		private readonly finishReason: unknown,
	) {
		super(model);
	}

	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
		_stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
		yield {
			content: { role: "model", parts: [{ text: "ok" }] },
			usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
			finish_reason: this.finishReason,
		} as LlmResponse;
	}
}

async function drain(gen: AsyncGenerator<LlmResponse, void, unknown>) {
	for await (const _ of gen) {
		/* drain */
	}
}

/**
 * Nineteenth leftover (complement #252 after tip #251):
 * `response.finish_reason || "unknown"` inside usage gate. Sixteenth pinned
 * classic falsy / `"0"`/`"false"`. Residual boolean-true / `"true"` / `[]` /
 * `-Infinity` keep; SameValueZero `-0` → `"unknown"`.
 */
describe("base-llm finish-reason boolean-true/string-true/negzero nineteenth leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "boolean true", finishReason: true, expected: true },
		{ label: "string true", finishReason: "true", expected: "true" },
		{ label: "empty array", finishReason: [], expected: [] },
		{
			label: "NEGATIVE_INFINITY",
			finishReason: Number.NEGATIVE_INFINITY,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "-0", finishReason: -0, expected: "unknown" },
	])('finish_reason || "unknown" ($label)', async ({
		finishReason,
		expected,
	}) => {
		const llm = new UsageLlm("fr-model", finishReason);
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);
		const usageCall = mockSetAttributes.mock.calls.find(
			(call) => call[0]["gen_ai.response.finish_reasons"],
		);
		expect(usageCall?.[0]["gen_ai.response.finish_reasons"]).toEqual([
			expected,
		]);
	});
});
