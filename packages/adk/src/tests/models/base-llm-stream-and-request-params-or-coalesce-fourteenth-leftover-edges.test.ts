import { BaseLlm, type LlmRequest, type LlmResponse } from "@adk/models";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger, mockSetAttributes, mockTracer } = vi.hoisted(() => {
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
	return {
		mockLogger: {
			debug: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
		},
		mockSetAttributes,
		mockTracer,
	};
});

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => mockLogger),
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

async function collect(
	gen: AsyncGenerator<LlmResponse, void, unknown>,
): Promise<LlmResponse[]> {
	const out: LlmResponse[] = [];
	for await (const item of gen) {
		out.push(item);
	}
	return out;
}

function firstRequestAttrs(): Record<string, unknown> {
	expect(mockSetAttributes).toHaveBeenCalled();
	return mockSetAttributes.mock.calls[0][0] as Record<string, unknown>;
}

/**
 * Fourteenth leftover: stream || false and request params || 0 on BaseLlm
 * span attrs — falsy → 0/false; " " / "0" kept. Telemetry tenth is the
 * other path (traceLlmCall).
 */
describe("base-llm stream and request-params || coalesce fourteenth leftover edges", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm("test-model");
	});

	it.each([
		{ label: "undefined", stream: undefined, expected: false },
		{ label: "empty string", stream: "", expected: false },
		{ label: "0", stream: 0, expected: false },
		{ label: "false", stream: false, expected: false },
		{ label: "whitespace", stream: " ", expected: " " },
		{ label: 'string "0"', stream: "0", expected: "0" },
	])("adk.streaming $label → $expected", async ({ stream, expected }) => {
		await collect(
			llm.generateContentAsync(
				{
					contents: [{ role: "user", parts: [{ text: "q" }] }],
					config: { maxOutputTokens: 1 },
				} as LlmRequest,
				stream as boolean,
			),
		);
		expect(firstRequestAttrs()["adk.streaming"]).toBe(expected);
	});

	it.each([
		{ label: "empty string", value: "", expected: 0 },
		{ label: "false", value: false, expected: 0 },
		{ label: "null", value: null, expected: 0 },
		{ label: "0", value: 0, expected: 0 },
		{ label: "whitespace", value: " ", expected: " " },
		{ label: 'string "0"', value: "0", expected: "0" },
	])("maxOutputTokens $label → $expected on span", async ({
		value,
		expected,
	}) => {
		await collect(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { maxOutputTokens: value },
			} as LlmRequest),
		);
		expect(firstRequestAttrs()["gen_ai.request.max_tokens"]).toBe(expected);
	});
});
