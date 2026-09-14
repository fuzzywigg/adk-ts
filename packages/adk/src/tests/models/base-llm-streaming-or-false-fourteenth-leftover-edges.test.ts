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
 * Fourteenth leftover: `adk.streaming: stream || false` — leftover only pinned
 * false / omitted. Falsy "" / 0 / null → false; truthy "0" / " " stay truthy.
 */
describe("base-llm streaming || false fourteenth leftover edges", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm("stream-model");
	});

	it.each([
		{ label: "empty string", stream: "" as any, expectedAttr: false },
		{ label: "0", stream: 0 as any, expectedAttr: false },
		{ label: "null", stream: null as any, expectedAttr: false },
		{ label: "false", stream: false, expectedAttr: false },
	])("falsy stream=$label → adk.streaming false", async ({
		stream,
		expectedAttr,
	}) => {
		const req = {
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		} as LlmRequest;
		await drain(llm.generateContentAsync(req, stream));
		expect(mockSetAttributes.mock.calls[0][0]["adk.streaming"]).toBe(
			expectedAttr,
		);
		expect(llm.lastStream).toBe(stream);
	});

	it.each([
		{ label: "zero string", stream: "0" as any },
		{ label: "whitespace", stream: " " as any },
		{ label: "true", stream: true },
	])("truthy stream=$label kept (no || false)", async ({ stream }) => {
		const req = {
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		} as LlmRequest;
		await drain(llm.generateContentAsync(req, stream));
		expect(mockSetAttributes.mock.calls[0][0]["adk.streaming"]).toBe(stream);
		expect(llm.lastStream).toBe(stream);
	});
});
