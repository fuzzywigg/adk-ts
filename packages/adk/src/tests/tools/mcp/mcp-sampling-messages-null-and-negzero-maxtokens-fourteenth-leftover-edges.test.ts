import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpErrorType } from "../../../tools/mcp/types";
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
 * Fourteenth leftover: `!messages || !Array.isArray(messages)` rejects null/false;
 * maxTokens -0 is falsy via !maxTokens and also `-0 <= 0`.
 */
describe("mcp sampling messages null + neg-zero maxTokens fourteenth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		null,
		false,
		0,
		"",
	] as const)("rejects messages=%j via !messages / !Array.isArray", async (messages) => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: { messages, maxTokens: 8 },
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("messages"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("rejects maxTokens: -0 via !maxTokens / <= 0", async () => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: -0,
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("maxTokens"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("empty messages array is truthy array so passes messages gate (control)", async () => {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: { messages: [], maxTokens: 8 },
		} as any);
		expect(handlerFn).toHaveBeenCalled();
	});
});
