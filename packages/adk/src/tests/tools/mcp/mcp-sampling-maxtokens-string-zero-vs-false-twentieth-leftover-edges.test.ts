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
 * Twentieth leftover: CreateMessageRequestSchema rejects string maxTokens
 * before the `!maxTokens || maxTokens <= 0` leftover gate — so "0"/"false"
 * never reach the numeric coerce asymmetry (unlike NaN which is typeof number).
 */
describe("mcp sampling maxTokens string rejected before gate twentieth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		"0",
		"false",
	] as const)("maxTokens: %j rejected at schema (never reaches leftover gate)", async (maxTokens) => {
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
			message: expect.stringMatching(
				/maxTokens|expected number|Invalid input/i,
			),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("maxTokens: -0 still rejected at leftover gate (fourteenth control)", async () => {
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
	});

	it("NaN still reaches leftover gate (thirteenth control)", async () => {
		try {
			await handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: Number.NaN,
				},
			} as any);
			expect(handlerFn).toHaveBeenCalled();
		} catch (error) {
			expect((error as Error).message).not.toMatch(
				/maxTokens must be a positive number/,
			);
		}
	});
});
