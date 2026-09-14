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
 * Seventeenth leftover: `if (!llmRequest.contents || contents.length === 0)`
 * then later `contents[last].role`. Falsy / empty already covered; truthy
 * non-array near-misses pass the empty check then throw on `.role` / length.
 */
describe("base-llm contents truthy nonarray append seventeenth leftover edges", () => {
	let llm: TestLlm;

	beforeEach(() => {
		llm = new TestLlm("test-model");
	});

	it.each([
		{ label: "null", contents: null },
		{ label: "undefined", contents: undefined },
		{ label: "0", contents: 0 },
		{ label: "false", contents: false },
		{ label: "empty string", contents: "" },
	])("falsy contents ($label) still coalesce to system-instruction hint", ({
		contents,
	}) => {
		const req = { contents, config: {} } as any;
		(llm as any).maybeAppendUserContent(req);
		expect(req.contents).toHaveLength(1);
		expect(req.contents[0].role).toBe("user");
		expect(req.contents[0].parts[0].text).toContain("System Instruction");
	});

	it.each([
		{ label: "zero string", contents: "0" },
		{ label: "whitespace", contents: " " },
		{ label: "empty object", contents: {} },
		{ label: "1", contents: 1 },
		{ label: "true", contents: true },
	])("truthy non-array $label passes empty check then throws", ({
		contents,
	}) => {
		const req = { contents, config: {} } as any;
		expect(() => (llm as any).maybeAppendUserContent(req)).toThrow();
	});

	it("real non-empty user array still early-returns without append", () => {
		const req = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
		});
		(llm as any).maybeAppendUserContent(req);
		expect(req.contents).toHaveLength(1);
		expect(req.contents[0].parts[0].text).toBe("hi");
	});
});
