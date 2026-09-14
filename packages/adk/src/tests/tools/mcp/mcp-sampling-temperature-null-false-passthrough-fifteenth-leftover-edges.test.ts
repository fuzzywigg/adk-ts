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
 * Fifteenth leftover: Zod expects number temperature, so null/false never
 * reach the verbatim config assignment. Numeric 0 still passes (fourteenth).
 */
describe("mcp sampling temperature null-false zod-reject fifteenth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		null,
		false,
	] as const)("temperature %j is rejected by Zod before passthrough", async (temperature) => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: 8,
					temperature,
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("Invalid sampling request"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("temperature: 0 still reaches config (control)", async () => {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
				maxTokens: 8,
				temperature: 0,
			},
		} as any);
		expect(handlerFn.mock.calls[0][0].config.temperature).toBe(0);
	});
});
