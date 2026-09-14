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
 * Fifteenth leftover: Zod safeint schema rejects boolean / Infinity / float
 * maxTokens before the `!maxTokens || <= 0` truthiness gate — so the
 * boolean-true trap is unreachable via the public handler. Distinct from
 * NaN thirteenth (NaN slips both layers).
 */
describe("mcp sampling maxTokens zod-before-gate fifteenth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		{ label: "true", maxTokens: true },
		{ label: "Infinity", maxTokens: Number.POSITIVE_INFINITY },
		{ label: "1.5 float", maxTokens: 1.5 },
	] as const)("maxTokens: $label rejected by Zod before truthiness gate", async ({
		maxTokens,
	}) => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: maxTokens as any,
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("maxTokens"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("finite int maxTokens: 1 still reaches handler (control)", async () => {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
				maxTokens: 1,
			},
		} as any);
		expect(handlerFn).toHaveBeenCalled();
		expect(handlerFn.mock.calls[0][0].config.maxOutputTokens).toBe(1);
	});
});
