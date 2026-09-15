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
		private readonly usage: Record<string, unknown>,
	) {
		super(model);
	}

	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
		_stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
		yield {
			content: { role: "model", parts: [{ text: "ok" }] },
			usage: this.usage,
			finish_reason: "STOP",
		} as LlmResponse;
	}
}

async function drain(gen: AsyncGenerator<LlmResponse, void, unknown>) {
	for await (const _ of gen) {
		/* drain */
	}
}

/**
 * Nineteenth leftover (complement #252 after tip #251): BaseLlm usage
 * `prompt_tokens/completion_tokens/total_tokens || 0`. Sixth/camelcase pinned
 * classic zeros. Residual boolean-true / `"true"` / `[]` / `-Infinity` keep;
 * SameValueZero `-0` → 0 (and accumulates as 0 into `adk.total_tokens`).
 */
describe("base-llm usage-tokens boolean-true/string-true/negzero nineteenth leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{
			label: "boolean true",
			usage: {
				prompt_tokens: true,
				completion_tokens: true,
				total_tokens: true,
			},
			// += coerces boolean true → 1
			expected: { in: true, out: true, total: true, adkTotal: 1 },
		},
		{
			label: "string true",
			usage: {
				prompt_tokens: "true",
				completion_tokens: "true",
				total_tokens: "true",
			},
			// += string-concats onto numeric 0 → "0true"
			expected: {
				in: "true",
				out: "true",
				total: "true",
				adkTotal: "0true",
			},
		},
		{
			label: "empty array",
			usage: {
				prompt_tokens: [],
				completion_tokens: [],
				total_tokens: [],
			},
			// += Array → "0" via ToString
			expected: { in: [], out: [], total: [], adkTotal: "0" },
		},
		{
			label: "NEGATIVE_INFINITY",
			usage: {
				prompt_tokens: Number.NEGATIVE_INFINITY,
				completion_tokens: Number.NEGATIVE_INFINITY,
				total_tokens: Number.NEGATIVE_INFINITY,
			},
			expected: {
				in: Number.NEGATIVE_INFINITY,
				out: Number.NEGATIVE_INFINITY,
				total: Number.NEGATIVE_INFINITY,
				adkTotal: Number.NEGATIVE_INFINITY,
			},
		},
		{
			label: "-0",
			usage: {
				prompt_tokens: -0,
				completion_tokens: -0,
				total_tokens: -0,
			},
			expected: { in: 0, out: 0, total: 0, adkTotal: 0 },
		},
	])("usage token || 0 / += accumulate ($label)", async ({
		usage,
		expected,
	}) => {
		const llm = new UsageLlm("usage-model", usage);
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);
		const usageCall = mockSetAttributes.mock.calls.find(
			(call) => call[0]["gen_ai.usage.input_tokens"] !== undefined,
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toEqual(expected.in);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toEqual(expected.out);
		expect(usageCall?.[0]["gen_ai.usage.total_tokens"]).toEqual(expected.total);
		const endCall = mockSetAttributes.mock.calls.find(
			(call) => call[0]["adk.total_tokens"] !== undefined,
		);
		expect(endCall?.[0]["adk.total_tokens"]).toEqual(expected.adkTotal);
	});
});
