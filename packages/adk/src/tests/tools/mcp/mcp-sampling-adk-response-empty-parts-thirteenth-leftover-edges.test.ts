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
 * Thirteenth leftover: convertADKResponseToMcp maps non-string part.text to ""
 * and joins — empty/non-string parts vanish into an empty MCP text payload.
 */
describe("mcp sampling ADK response empty parts thirteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertADKResponseToMcp.bind(handler);

	it("joins only string part.text; non-strings become empty", () => {
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [
					{ text: "a" },
					{ text: "" },
					{ text: 0 as any },
					{ functionCall: { name: "x", args: {} } },
					{ text: "b" },
				],
			},
		});
		expect(convert(response, "gemini-2.0-flash").content).toEqual({
			type: "text",
			text: "ab",
		});
	});

	it("all-empty parts yield empty string text", () => {
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: "" }, { text: undefined as any }],
			},
		});
		expect(convert(response, "m").content.text).toBe("");
	});

	it("direct empty-string ADK response is kept", () => {
		expect(convert("", "m").content.text).toBe("");
	});
});
