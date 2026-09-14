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
 * Nineteenth leftover (HEAVY tip-relaunch residual after #248):
 * BaseLlm span `maxOutputTokens/temperature/topP || 0`. Fifteenth pinned
 * whitespace/`"0"`; telemetry eighteenth pinned TelemetryService path.
 * Residual boolean-true / `"true"` / `[]` / `-Infinity` keep; `-0` → 0.
 */
describe("base-llm request-params boolean-true/string-true/negzero nineteenth leftover edges", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm("params-model");
	});

	it.each([
		{
			label: "boolean true",
			config: {
				maxOutputTokens: true,
				temperature: true,
				topP: true,
			},
			expected: { max: true, temp: true, topP: true },
		},
		{
			label: "string true",
			config: {
				maxOutputTokens: "true",
				temperature: "true",
				topP: "true",
			},
			expected: { max: "true", temp: "true", topP: "true" },
		},
		{
			label: "empty array",
			config: {
				maxOutputTokens: [],
				temperature: [],
				topP: [],
			},
			expected: { max: [], temp: [], topP: [] },
		},
		{
			label: "NEGATIVE_INFINITY",
			config: {
				maxOutputTokens: Number.NEGATIVE_INFINITY,
				temperature: Number.NEGATIVE_INFINITY,
				topP: Number.NEGATIVE_INFINITY,
			},
			expected: {
				max: Number.NEGATIVE_INFINITY,
				temp: Number.NEGATIVE_INFINITY,
				topP: Number.NEGATIVE_INFINITY,
			},
		},
		{
			label: "SameValueZero -0",
			config: {
				maxOutputTokens: -0,
				temperature: -0,
				topP: -0,
			},
			expected: { max: 0, temp: 0, topP: 0 },
		},
	])("span request params ($label)", async ({ config, expected }) => {
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config,
			} as LlmRequest),
		);
		const attrs = mockSetAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.request.max_tokens"]).toEqual(expected.max);
		expect(attrs["gen_ai.request.temperature"]).toEqual(expected.temp);
		expect(attrs["gen_ai.request.top_p"]).toEqual(expected.topP);
	});
});
