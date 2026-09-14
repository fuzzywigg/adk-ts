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

class TestLlm extends BaseLlm {
	public implResponses: LlmResponse[] = [];

	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
		_stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
		for (const resp of this.implResponses) {
			yield resp;
		}
	}
}

async function drain(gen: AsyncGenerator<LlmResponse, void, unknown>) {
	for await (const _ of gen) {
		/* drain */
	}
}

/**
 * Seventeenth leftover: BaseLlm snake `usage.*_tokens || 0` keeps whitespace /
 * `"0"` / `"false"` truthy strings. Fifteenth BaseLlm is request params;
 * sixth covers numeric 0/undefined only.
 */
describe("base-llm usage-token whitespace or-zero seventeenth leftover edges", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm("usage-model");
	});

	it.each([
		{
			label: "null / empty / false",
			usage: {
				prompt_tokens: null,
				completion_tokens: "",
				total_tokens: false,
			},
			expected: { in: 0, out: 0, total: 0 },
		},
		{
			label: "whitespace / zero-string / false-string truthy",
			usage: {
				prompt_tokens: " ",
				completion_tokens: "0",
				total_tokens: "false",
			},
			expected: { in: " ", out: "0", total: "false" },
		},
		{
			label: "numeric truthy",
			usage: {
				prompt_tokens: 4,
				completion_tokens: 5,
				total_tokens: 9,
			},
			expected: { in: 4, out: 5, total: 9 },
		},
	])("span usage tokens ($label)", async ({ usage, expected }) => {
		llm.implResponses = [
			{
				content: { role: "model", parts: [{ text: "z" }] },
				usage,
				finish_reason: "stop",
			} as LlmResponse,
		];
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);
		expect(mockSetAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				"gen_ai.usage.input_tokens": expected.in,
				"gen_ai.usage.output_tokens": expected.out,
				"gen_ai.usage.total_tokens": expected.total,
			}),
		);
	});
});
