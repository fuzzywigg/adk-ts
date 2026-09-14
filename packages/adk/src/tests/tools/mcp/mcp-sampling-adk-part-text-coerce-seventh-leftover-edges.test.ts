import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmResponse } from "../../../models/llm-response";
import {
	McpSamplingHandler,
	createSamplingHandler,
} from "../../../tools/mcp/sampling-handler";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

describe("McpSamplingHandler ADK part.text coerce seventh leftover (post #158)", () => {
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handler = new McpSamplingHandler(createSamplingHandler(async () => "ok"));
	});

	it.each([
		{ label: "number", text: 42 },
		{ label: "boolean true", text: true },
		{ label: "boolean false", text: false },
		{ label: "null", text: null },
		{ label: "object", text: { raw: 1 } },
	] as const)("drops non-string part.text ($label) to empty via typeof === 'string' ? text : ''", ({
		text,
	}) => {
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: text as any }, { text: "kept" }],
			},
		});
		const mcp = (handler as any).convertADKResponseToMcp(response);
		expect(mcp.content).toEqual({ type: "text", text: "kept" });
	});

	it("joins only string texts when mixed with non-string parts", () => {
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [
					{ text: 1 as any },
					{ text: "a" },
					{ text: null as any },
					{ text: "b" },
					{ inlineData: { mimeType: "text/plain", data: "eA==" } } as any,
				],
			},
		});
		const mcp = (handler as any).convertADKResponseToMcp(response);
		expect(mcp.content.text).toBe("ab");
	});

	it("yields empty text when content has no parts key", () => {
		const response = new LlmResponse({
			content: { role: "model" } as any,
		});
		const mcp = (handler as any).convertADKResponseToMcp(response);
		expect(mcp.content).toEqual({ type: "text", text: "" });
	});

	it("yields empty text when all part texts are non-string", () => {
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: 0 as any }, { text: false as any }],
			},
		});
		const mcp = (handler as any).convertADKResponseToMcp(response);
		expect(mcp.content.text).toBe("");
	});

	it("passes through string ADK responses unchanged", () => {
		const mcp = (handler as any).convertADKResponseToMcp("plain-string");
		expect(mcp.content.text).toBe("plain-string");
	});
});
