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
 * Fifteenth leftover: span serialization uses `typeof part.text === "string"`,
 * not truthiness — "" / "0" stay strings; 0 / false / {} become sentinel.
 */
describe("base-llm part text typeof string fifteenth leftover edges", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm("typeof-model");
	});

	it.each([
		{ label: "empty string", text: "", expected: "" },
		{ label: "zero string", text: "0", expected: "0" },
		{ label: "whitespace", text: " ", expected: " " },
	])("keeps string text ($label)", async ({ text, expected }) => {
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text }] }],
			} as LlmRequest),
		);
		const payload = JSON.parse(
			mockSetAttributes.mock.calls[0][0]["adk.llm_request"],
		);
		expect(payload.contents[0].parts[0].text).toBe(expected);
	});

	it.each([
		{ label: "0", text: 0 },
		{ label: "false", text: false },
		{ label: "object", text: {} },
	])('non-string text ($label) → "[non_text_content]"', async ({ text }) => {
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: text as any }] }],
			} as LlmRequest),
		);
		const payload = JSON.parse(
			mockSetAttributes.mock.calls[0][0]["adk.llm_request"],
		);
		expect(payload.contents[0].parts[0].text).toBe("[non_text_content]");
	});
});
