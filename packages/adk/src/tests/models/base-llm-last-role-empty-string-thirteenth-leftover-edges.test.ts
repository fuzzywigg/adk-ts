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

/**
 * Thirteenth leftover: last role === "user" is exact. Empty / undefined /
 * whitespace roles still append the continue hint. Seventh leftover pinned
 * mixed-case "User"/"USER".
 */
describe("base-llm last role empty-string thirteenth leftover edges", () => {
	let llm: TestLlm;

	beforeEach(() => {
		llm = new TestLlm("test-model");
	});

	it.each([
		"",
		" ",
		"user ",
		undefined,
	])('last role %j !== exact "user" appends continue hint', (role) => {
		const req = new LlmRequest({
			contents: [{ role, parts: [{ text: "prior" }] } as any],
		});
		(llm as any).maybeAppendUserContent(req);
		expect(req.contents).toHaveLength(2);
		expect(req.contents?.[1].role).toBe("user");
		expect(req.contents?.[1].parts?.[0].text).toMatch(/Continue processing/);
	});

	it('exact lowercase "user" does not append (control)', () => {
		const req = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "prior" }] }],
		});
		(llm as any).maybeAppendUserContent(req);
		expect(req.contents).toHaveLength(1);
	});
});
