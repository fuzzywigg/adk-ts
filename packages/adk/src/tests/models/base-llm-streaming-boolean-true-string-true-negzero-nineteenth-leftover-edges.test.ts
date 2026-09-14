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
	public lastStream: boolean | undefined;

	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
		stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
		this.lastStream = stream;
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
 * Nineteenth leftover (complement #252 after tip #251): `adk.streaming:
 * stream || false`. Fourteenth pinned classic falsy + `"0"`/`true` keep.
 * Residual `"true"` / `[]` / `-Infinity` keep; SameValueZero `-0` → false.
 */
describe("base-llm streaming boolean-true/string-true/negzero nineteenth leftover edges", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm("stream-model");
	});

	it.each([
		{ label: "boolean true", stream: true as any },
		{ label: "string true", stream: "true" as any },
		{ label: "empty array", stream: [] as any },
		{
			label: "NEGATIVE_INFINITY",
			stream: Number.NEGATIVE_INFINITY as any,
		},
	])("truthy stream=$label kept (no || false)", async ({ stream }) => {
		const req = {
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		} as LlmRequest;
		await drain(llm.generateContentAsync(req, stream));
		expect(mockSetAttributes.mock.calls[0][0]["adk.streaming"]).toBe(stream);
		expect(llm.lastStream).toBe(stream);
	});

	it("SameValueZero -0 collapses to false via ||", async () => {
		const req = {
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		} as LlmRequest;
		await drain(llm.generateContentAsync(req, -0 as any));
		expect(mockSetAttributes.mock.calls[0][0]["adk.streaming"]).toBe(false);
		expect(Object.is(llm.lastStream as any, -0)).toBe(true);
	});
});
