import { describe, expect, it, vi } from "vitest";
import { LlmResponse } from "../../../models/llm-response";
import { McpSamplingHandler } from "../../../tools/mcp/sampling-handler";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

/**
 * Fifteenth leftover: `if (adkResponse.content)` — empty string is falsy so
 * response text stays ""; string "0" is truthy and kept.
 */
describe("mcp sampling adk content empty vs string-zero fifteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertADKResponseToMcp.bind(handler);

	it('content: "" is falsy so MCP text stays empty', () => {
		const resp = convert(
			new LlmResponse({ content: "" as any }),
			"gemini-2.0-flash",
		);
		expect(resp.content).toEqual({ type: "text", text: "" });
	});

	it('content: "0" is truthy string and kept', () => {
		const resp = convert(
			new LlmResponse({ content: "0" as any }),
			"gemini-2.0-flash",
		);
		expect(resp.content).toEqual({ type: "text", text: "0" });
	});

	it("direct string response still passes through (control)", () => {
		expect(convert("hello", "m")).toEqual({
			model: "m",
			role: "assistant",
			content: { type: "text", text: "hello" },
		});
	});
});
