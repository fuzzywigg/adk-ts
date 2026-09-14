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
 * Fifteenth leftover: CreateMessageRequestSchema requires number maxTokens —
 * string `"0"` / `"8"` reject at schema before `!maxTokens || <= 0`. Numeric
 * `0` / `-1` pass schema then hit the positive-number gate.
 */
describe("mcp sampling maxTokens schema-vs-gate fifteenth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		"0",
		"8",
		"",
	] as const)("string maxTokens %j rejected by schema (not the <=0 gate message)", async (maxTokens) => {
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
			message: expect.stringMatching(/expected number|Invalid input/i),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it.each([
		0, -1,
	] as const)("numeric %j passes schema then hits positive-number gate", async (maxTokens) => {
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
			message: expect.stringContaining("maxTokens must be a positive number"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("numeric 8 still accepted (control)", async () => {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
				maxTokens: 8,
			},
		} as any);
		expect(handlerFn).toHaveBeenCalled();
	});
});
