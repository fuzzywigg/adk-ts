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
		private readonly usage: Record<string, unknown>,
	) {
		super(model);
	}

	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
		_stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
		yield {
			content: { role: "model", parts: [{ text: "ok" }] },
			usage: this.usage,
			finish_reason: "STOP",
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
 * BaseLlm usage `prompt_tokens/completion_tokens/total_tokens || 0` —
 * boxed-falsy / `"-Infinity"` / `-1` keep with += accumulate asymmetries.
 */
describe("base-llm usage-tokens object-false/zero/empty nineteenth residual deepen", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("Object(false) tokens stay via || 0; += ToPrimitive → 0 adkTotal", async () => {
		const boxed = Object(false);
		const usage = {
			prompt_tokens: boxed,
			completion_tokens: boxed,
			total_tokens: boxed,
		};
		const llm = new UsageLlm("usage-model", usage);
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);
		const usageCall = mockSetAttributes.mock.calls.find(
			(call) => call[0]["gen_ai.usage.input_tokens"] !== undefined,
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(boxed);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(boxed);
		expect(usageCall?.[0]["gen_ai.usage.total_tokens"]).toBe(boxed);
		const endCall = mockSetAttributes.mock.calls.find(
			(call) => call[0]["adk.total_tokens"] !== undefined,
		);
		expect(endCall?.[0]["adk.total_tokens"]).toBe(0);
	});

	it("Object(0) tokens stay via || 0; += ToPrimitive → 0 adkTotal", async () => {
		const boxed = Object(0);
		const usage = {
			prompt_tokens: boxed,
			completion_tokens: boxed,
			total_tokens: boxed,
		};
		const llm = new UsageLlm("usage-model", usage);
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);
		const usageCall = mockSetAttributes.mock.calls.find(
			(call) => call[0]["gen_ai.usage.input_tokens"] !== undefined,
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(boxed);
		const endCall = mockSetAttributes.mock.calls.find(
			(call) => call[0]["adk.total_tokens"] !== undefined,
		);
		expect(endCall?.[0]["adk.total_tokens"]).toBe(0);
	});

	it('string "-Infinity" tokens stay; += string-concats to "0-Infinity"', async () => {
		const usage = {
			prompt_tokens: "-Infinity",
			completion_tokens: "-Infinity",
			total_tokens: "-Infinity",
		};
		const llm = new UsageLlm("usage-model", usage);
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);
		const usageCall = mockSetAttributes.mock.calls.find(
			(call) => call[0]["gen_ai.usage.input_tokens"] !== undefined,
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe("-Infinity");
		const endCall = mockSetAttributes.mock.calls.find(
			(call) => call[0]["adk.total_tokens"] !== undefined,
		);
		expect(endCall?.[0]["adk.total_tokens"]).toBe("0-Infinity");
	});

	it("number -1 tokens stay; += accumulates to -1", async () => {
		const usage = {
			prompt_tokens: -1,
			completion_tokens: -1,
			total_tokens: -1,
		};
		const llm = new UsageLlm("usage-model", usage);
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			} as LlmRequest),
		);
		const usageCall = mockSetAttributes.mock.calls.find(
			(call) => call[0]["gen_ai.usage.input_tokens"] !== undefined,
		);
		expect(usageCall?.[0]["gen_ai.usage.input_tokens"]).toBe(-1);
		expect(usageCall?.[0]["gen_ai.usage.output_tokens"]).toBe(-1);
		expect(usageCall?.[0]["gen_ai.usage.total_tokens"]).toBe(-1);
		const endCall = mockSetAttributes.mock.calls.find(
			(call) => call[0]["adk.total_tokens"] !== undefined,
		);
		expect(endCall?.[0]["adk.total_tokens"]).toBe(-1);
	});
});
