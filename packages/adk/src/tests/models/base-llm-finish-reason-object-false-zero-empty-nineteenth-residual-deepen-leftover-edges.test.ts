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
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `response.finish_reason || "unknown"` — boxed-falsy / `"-Infinity"` / `-1`
 * keep; primitive NaN → `"unknown"`.
 */
describe("base-llm finish-reason object-false/zero/empty nineteenth residual deepen", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "Object(false)", finishReason: Object(false) },
		{ label: "Object(0)", finishReason: Object(0) },
		{ label: 'Object("")', finishReason: Object("") },
		{ label: "Object(NaN)", finishReason: Object(Number.NaN) },
		{ label: 'string "-Infinity"', finishReason: "-Infinity" },
		{ label: "number -1", finishReason: -1 },
	])('finish_reason || "unknown" ($label) kept', async ({ finishReason }) => {
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
			finishReason,
		]);
	});

	it("primitive NaN still collapses to unknown (control)", async () => {
		const llm = new UsageLlm("fr-nan", Number.NaN);
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);
		const usageCall = mockSetAttributes.mock.calls.find(
			(call) => call[0]["gen_ai.response.finish_reasons"],
		);
		expect(usageCall?.[0]["gen_ai.response.finish_reasons"]).toEqual([
			"unknown",
		]);
	});
});
