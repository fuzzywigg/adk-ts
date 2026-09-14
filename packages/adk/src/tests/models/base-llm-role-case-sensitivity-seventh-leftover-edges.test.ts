import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseLlm } from "../../models/base-llm";
import { LlmRequest } from "../../models/llm-request";
import type { LlmResponse } from "../../models/llm-response";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

class TestLlm extends BaseLlm {
	async *generateContentAsyncImpl(
		_llmRequest: LlmRequest,
		_stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
		yield {
			content: { role: "model", parts: [{ text: "ok" }] },
		} as LlmResponse;
	}
}

describe("BaseLlm maybeAppendUserContent role case-sensitivity seventh leftover (post #160)", () => {
	let llm: TestLlm;

	beforeEach(() => {
		llm = new TestLlm("test-model");
	});

	it.each([
		"USER",
		"User",
		"uSer",
		"USER ",
	])('last role %j !== exact "user" still appends continue hint', (role) => {
		const req = new LlmRequest({
			contents: [{ role, parts: [{ text: "prior" }] } as any],
		});

		(llm as any).maybeAppendUserContent(req);

		expect(req.contents).toHaveLength(2);
		expect(req.contents?.[1]).toEqual({
			role: "user",
			parts: [
				{
					text: "Continue processing previous requests as instructed. Exit or provide a summary if no more outputs are needed.",
				},
			],
		});
	});

	it('exact lowercase "user" does not append (control)', () => {
		const req = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "prior" }] }],
		});

		(llm as any).maybeAppendUserContent(req);

		expect(req.contents).toHaveLength(1);
		expect(req.contents?.[0].parts?.[0].text).toBe("prior");
	});

	it("model/assistant last roles append continue hint (existing asymmetry)", () => {
		for (const role of ["model", "assistant", "system"] as const) {
			const req = new LlmRequest({
				contents: [{ role, parts: [{ text: "x" }] } as any],
			});
			(llm as any).maybeAppendUserContent(req);
			expect(req.contents).toHaveLength(2);
			expect(req.contents?.[1].role).toBe("user");
		}
	});
});
