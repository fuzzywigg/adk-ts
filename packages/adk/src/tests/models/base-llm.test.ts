import type { LlmRequest } from "@adk/models";
import { BaseLlm } from "@adk/models";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

const {
	mockSetAttributes,
	mockRecordException,
	mockSetStatus,
	mockEnd,
	mockSpan,
	mockTracer,
} = vi.hoisted(() => {
	const mockSetAttributes = vi.fn();
	const mockRecordException = vi.fn();
	const mockSetStatus = vi.fn();
	const mockEnd = vi.fn();
	const mockSpan = {
		setAttributes: mockSetAttributes,
		recordException: mockRecordException,
		setStatus: mockSetStatus,
		end: mockEnd,
	};
	const mockTracer = {
		startActiveSpan: vi.fn(
			(_name: string, fn: (span: typeof mockSpan) => unknown) => fn(mockSpan),
		),
	};
	return {
		mockSetAttributes,
		mockRecordException,
		mockSetStatus,
		mockEnd,
		mockSpan,
		mockTracer,
	};
});

vi.mock("../../telemetry", () => ({
	tracer: mockTracer,
}));

class TestLlm extends BaseLlm {
	public implResponses: Array<Record<string, unknown>> = [];
	public implError: Error | null = null;

	constructor(model = "test-model") {
		super(model);
	}

	protected async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
		_stream?: boolean,
	): AsyncGenerator<any, void, unknown> {
		if (this.implError) {
			throw this.implError;
		}
		for (const resp of this.implResponses) {
			yield resp;
		}
	}
}

describe("BaseLlm", () => {
	let llm: TestLlm;

	beforeEach(() => {
		vi.clearAllMocks();
		llm = new TestLlm();
		mockTracer.startActiveSpan.mockImplementation(
			(_name: string, fn: (span: typeof mockSpan) => unknown) => fn(mockSpan),
		);
	});

	it("should set model in constructor", () => {
		expect(llm.model).toBe("test-model");
		const custom = new TestLlm("custom-model");
		expect(custom.model).toBe("custom-model");
	});

	it("supportedModels returns empty array", () => {
		expect(BaseLlm.supportedModels()).toEqual([]);
	});

	describe("maybeAppendUserContent", () => {
		it("should add user content if contents is undefined", () => {
			const req: any = {};
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(1);
			expect(req.contents[0].role).toBe("user");
			expect(req.contents[0].parts[0].text).toContain("System Instruction");
		});

		it("should add user content if contents is empty", () => {
			const req: any = { contents: [] };
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(1);
			expect(req.contents[0].role).toBe("user");
		});

		it("should append user content if last role is not user", () => {
			const req: any = {
				contents: [{ role: "model", parts: [{ text: "x" }] }],
			};
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(2);
			expect(req.contents[1].role).toBe("user");
			expect(req.contents[1].parts[0].text).toContain("Continue processing");
		});

		it("should not append if last role is user", () => {
			const req: any = { contents: [{ role: "user", parts: [] }] };
			llm["maybeAppendUserContent"](req);
			expect(req.contents).toHaveLength(1);
		});
	});

	describe("generateContentAsync", () => {
		it("traces non-streaming responses and truncates long text parts", async () => {
			const longText = "a".repeat(250);
			llm.implResponses = [
				{
					usage: {
						prompt_tokens: 3,
						completion_tokens: 7,
						total_tokens: 10,
					},
					finish_reason: "STOP",
				},
			];

			const req: any = {
				contents: [
					{
						role: "user",
						parts: [{ text: longText }, { inlineData: { data: "x" } }],
					},
				],
				config: { maxOutputTokens: 100, temperature: 0.2, topP: 0.9 },
			};

			const out: any[] = [];
			for await (const resp of llm.generateContentAsync(req, false)) {
				out.push(resp);
			}

			expect(out).toHaveLength(1);
			expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
				"llm_generate [test-model]",
				expect.any(Function),
			);
			expect(mockSetAttributes).toHaveBeenCalled();
			const firstAttrs = mockSetAttributes.mock.calls[0][0];
			expect(firstAttrs["gen_ai.request.model"]).toBe("test-model");
			expect(firstAttrs["adk.streaming"]).toBe(false);
			const requestPayload = JSON.parse(firstAttrs["adk.llm_request"]);
			expect(requestPayload.contents[0].parts[0].text.endsWith("...")).toBe(
				true,
			);
			expect(requestPayload.contents[0].parts[1].text).toBe(
				"[non_text_content]",
			);
			expect(mockEnd).toHaveBeenCalled();
			expect(
				mockSetAttributes.mock.calls.some(
					(c) =>
						c[0]["adk.response_count"] === 1 && c[0]["adk.total_tokens"] === 10,
				),
			).toBe(true);
		});

		it("appends user content before generation when contents empty", async () => {
			llm.implResponses = [{ usage: { total_tokens: 1 } }];
			const req: any = { contents: [] };

			const out: any[] = [];
			for await (const resp of llm.generateContentAsync(req, true)) {
				out.push(resp);
			}

			expect(req.contents).toHaveLength(1);
			expect(req.contents[0].role).toBe("user");
			expect(out).toHaveLength(1);
			const firstAttrs = mockSetAttributes.mock.calls[0][0];
			expect(firstAttrs["adk.streaming"]).toBe(true);
		});

		it("records and rethrows impl errors", async () => {
			const err = new Error("provider down");
			llm.implError = err;
			const req: any = {
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
			};

			await expect(async () => {
				for await (const _ of llm.generateContentAsync(req)) {
					/* drain */
				}
			}).rejects.toThrow("provider down");

			expect(mockRecordException).toHaveBeenCalledWith(err);
			expect(mockSetStatus).toHaveBeenCalledWith({
				code: 2,
				message: "provider down",
			});
			expect(mockEnd).toHaveBeenCalled();
		});

		it("handles responses without usage metadata", async () => {
			llm.implResponses = [{ content: { parts: [{ text: "ok" }] } }];
			const req: any = {
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			};

			const out: any[] = [];
			for await (const resp of llm.generateContentAsync(req)) {
				out.push(resp);
			}
			expect(out).toHaveLength(1);
			expect(
				mockSetAttributes.mock.calls.some(
					(c) => c[0]["adk.total_tokens"] === 0,
				),
			).toBe(true);
		});
	});

	describe("connect", () => {
		it("should throw error", () => {
			expect(() => llm.connect({} as any)).toThrow(
				"Live connection is not supported for test-model.",
			);
		});
	});
});
