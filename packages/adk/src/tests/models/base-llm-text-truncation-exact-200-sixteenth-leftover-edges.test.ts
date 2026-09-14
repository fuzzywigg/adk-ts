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

class CapturingLlm extends BaseLlm {
	constructor(
		model: string,
		private readonly text: string,
	) {
		super(model);
	}

	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
		_stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
		yield {
			content: { role: "model", parts: [{ text: this.text }] },
		} as LlmResponse;
	}
}

async function drain(gen: AsyncGenerator<LlmResponse, void, unknown>) {
	for await (const _ of gen) {
		/* drain */
	}
}

/**
 * Sixteenth leftover: span text truncation uses `length > 200` (not >=).
 * Exact length 200 keeps full string without "..."; 201 truncates.
 * Fifteenth covered typeof === "string" only.
 */
describe("base-llm text truncation exact-200 sixteenth leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("exact length 200 keeps full string without ellipsis", async () => {
		const text = "a".repeat(200);
		const llm = new CapturingLlm("trunc-model", "ignored");
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text }] }],
			} as LlmRequest),
		);
		const payload = JSON.parse(
			mockSetAttributes.mock.calls[0][0]["adk.llm_request"],
		);
		expect(payload.contents[0].parts[0].text).toBe(text);
		expect(payload.contents[0].parts[0].text).not.toContain("...");
	});

	it("length 201 truncates to 200 chars plus ellipsis", async () => {
		const text = "b".repeat(201);
		const llm = new CapturingLlm("trunc-model", "ignored");
		await drain(
			llm.generateContentAsync({
				contents: [{ role: "user", parts: [{ text }] }],
			} as LlmRequest),
		);
		const payload = JSON.parse(
			mockSetAttributes.mock.calls[0][0]["adk.llm_request"],
		);
		expect(payload.contents[0].parts[0].text).toBe(`${"b".repeat(200)}...`);
	});
});
