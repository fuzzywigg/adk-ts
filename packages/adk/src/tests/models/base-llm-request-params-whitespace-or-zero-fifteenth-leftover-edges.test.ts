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
	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
		_stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
		yield {
			content: { role: "model", parts: [{ text: "ok" }] },
		} as LlmResponse;
	}
}

async function drain(gen: AsyncGenerator<LlmResponse, void, unknown>) {
	for await (const _ of gen) {
		/* drain */
	}
}

/**
 * Fifteenth leftover: BaseLlm span `maxOutputTokens/temperature/topP || 0`.
 * Telemetry tenth leftover pinned the same matrix on TelemetryService only.
 */
describe("base-llm request-params whitespace or-zero fifteenth leftover edges", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm("params-model");
	});

	it.each([
		{
			label: "null / empty / false",
			config: {
				maxOutputTokens: null,
				temperature: "",
				topP: false,
			},
			expected: { max: 0, temp: 0, topP: 0 },
		},
		{
			label: "explicit zeros",
			config: { maxOutputTokens: 0, temperature: 0, topP: 0 },
			expected: { max: 0, temp: 0, topP: 0 },
		},
		{
			label: "whitespace / zero-string truthy",
			config: {
				maxOutputTokens: " ",
				temperature: "0",
				topP: "false",
			},
			expected: { max: " ", temp: "0", topP: "false" },
		},
		{
			label: "numeric truthy",
			config: { maxOutputTokens: 128, temperature: 0.5, topP: 0.9 },
			expected: { max: 128, temp: 0.5, topP: 0.9 },
		},
	])("span request params ($label)", async ({ config, expected }) => {
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config,
			} as LlmRequest),
		);
		const attrs = mockSetAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.request.max_tokens"]).toBe(expected.max);
		expect(attrs["gen_ai.request.temperature"]).toBe(expected.temp);
		expect(attrs["gen_ai.request.top_p"]).toBe(expected.topP);
	});
});
