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
 * Twentieth leftover: `!maxTokens || maxTokens <= 0` — boolean `true` is
 * truthy and `true <= 0` is false so the gate lets it through (thirteenth
 * pinned NaN/Infinity; fourteenth pinned -0 reject). `messages: true` fails
 * `!Array.isArray` after passing `!messages`.
 */
describe("mcp sampling maxTokens boolean-true + messages true twentieth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it("maxTokens: boolean true passes !maxTokens / <= 0 gate", async () => {
		try {
			await handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: true,
				},
			} as any);
			expect(handlerFn).toHaveBeenCalled();
			expect(handlerFn.mock.calls[0][0].config.maxOutputTokens).toBe(true);
		} catch (error) {
			expect((error as Error).message).not.toMatch(
				/maxTokens must be a positive number/,
			);
		}
	});

	it('maxTokens: string "true" also passes numeric gate (coercion asymmetry)', async () => {
		try {
			await handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: "true",
				},
			} as any);
			expect(handlerFn).toHaveBeenCalled();
			expect(handlerFn.mock.calls[0][0].config.maxOutputTokens).toBe("true");
		} catch (error) {
			expect((error as Error).message).not.toMatch(
				/maxTokens must be a positive number/,
			);
		}
	});

	it("messages: true rejects via !Array.isArray after !messages passes", async () => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: { messages: true, maxTokens: 8 },
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("messages"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("maxTokens: false still rejected (control vs boolean true)", async () => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: false,
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("maxTokens"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});
});
