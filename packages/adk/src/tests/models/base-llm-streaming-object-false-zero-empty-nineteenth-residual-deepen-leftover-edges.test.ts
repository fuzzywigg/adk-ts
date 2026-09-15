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
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `adk.streaming: stream || false` — boxed-falsy / `"-Infinity"` / `-1` keep.
 */
describe("base-llm streaming object-false/zero/empty nineteenth residual deepen", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm("stream-model");
	});

	it.each([
		{ label: "Object(false)", stream: Object(false) as any },
		{ label: "Object(0)", stream: Object(0) as any },
		{ label: 'Object("")', stream: Object("") as any },
		{ label: "Object(NaN)", stream: Object(Number.NaN) as any },
		{ label: 'string "-Infinity"', stream: "-Infinity" as any },
		{ label: "number -1", stream: -1 as any },
	])("truthy stream=$label kept (no || false)", async ({ stream }) => {
		const req = {
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		} as LlmRequest;
		await drain(llm.generateContentAsync(req, stream));
		expect(mockSetAttributes.mock.calls[0][0]["adk.streaming"]).toBe(stream);
		expect(llm.lastStream).toBe(stream);
	});
});
