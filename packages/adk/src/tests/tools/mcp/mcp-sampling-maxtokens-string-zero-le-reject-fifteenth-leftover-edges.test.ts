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
 * Fifteenth leftover: CreateMessageRequestSchema expects number maxTokens, so
 * string "0"/"8" never reach `!maxTokens || maxTokens <= 0` — Zod rejects first.
 * Numeric -0 still hits the gate (fourteenth).
 */
describe("mcp sampling maxTokens string-zero zod-reject fifteenth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		"0",
		"8",
	] as const)("rejects maxTokens: %j at Zod before the <= 0 gate", async (maxTokens) => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens,
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("Invalid sampling request"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("numeric maxTokens: 8 still reaches the handler (control)", async () => {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
				maxTokens: 8,
			},
		} as any);
		expect(handlerFn).toHaveBeenCalled();
		expect(handlerFn.mock.calls[0][0].config.maxOutputTokens).toBe(8);
	});
});
