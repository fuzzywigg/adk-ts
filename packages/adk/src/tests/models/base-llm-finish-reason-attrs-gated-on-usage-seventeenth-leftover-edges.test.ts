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
 * Seventeenth leftover: finish_reason span attrs only emit inside
 * `if (response.usage)`. #219 pins falsy finish_reason → "unknown" when usage
 * exists; sixth pins camelCase usageMetadata ignore — residual is STOP with
 * no usage vs truthy empty `{}` usage gate.
 */
describe("base-llm finish-reason attrs gated on usage seventeenth leftover edges", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm("gate-model");
	});

	it("finish_reason STOP without usage never sets gen_ai.response.finish_reasons", async () => {
		llm.implResponses = [
			{
				content: { role: "model", parts: [{ text: "ok" }] },
				finish_reason: "STOP",
			} as LlmResponse,
		];
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);
		const finishCalls = mockSetAttributes.mock.calls.filter((c) =>
			Object.hasOwn(c[0] as object, "gen_ai.response.finish_reasons"),
		);
		expect(finishCalls).toHaveLength(0);
	});

	it("truthy empty usage {} still opens the gate and emits finish_reasons", async () => {
		llm.implResponses = [
			{
				content: { role: "model", parts: [{ text: "ok" }] },
				finish_reason: "STOP",
				usage: {},
			} as LlmResponse,
		];
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);
		expect(mockSetAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				"gen_ai.response.finish_reasons": ["STOP"],
				"gen_ai.usage.input_tokens": 0,
				"gen_ai.usage.output_tokens": 0,
				"gen_ai.usage.total_tokens": 0,
			}),
		);
	});

	it("falsy usage null skips gate even with finish_reason present", async () => {
		llm.implResponses = [
			{
				content: { role: "model", parts: [{ text: "ok" }] },
				finish_reason: "STOP",
				usage: null,
			} as LlmResponse,
		];
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);
		const finishCalls = mockSetAttributes.mock.calls.filter((c) =>
			Object.hasOwn(c[0] as object, "gen_ai.response.finish_reasons"),
		);
		expect(finishCalls).toHaveLength(0);
	});
});
