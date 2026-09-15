import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpSamplingHandler } from "../../../tools/mcp/sampling-handler";
import { McpErrorType } from "../../../tools/mcp/types";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after providers tip #269):
 * maxTokens Zod-number gate — complements closed #271 true/`"true"`/`[]`/
 * `-Infinity` reject; thirteenth soft-pass for NaN/`+Infinity` now lands as
 * Zod `invalid_type` reject (finite-number schema). Number `1` still passes.
 */
describe("mcp sampling maxTokens nan/posinf twentieth leftover heavy", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NaN", value: Number.NaN },
		{ label: "Object(true)", value: Object(true) },
		{ label: '"Infinity"', value: "Infinity" },
	])("maxTokens $label rejected at Zod before <= 0 gate", async ({ value }) => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: value,
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringMatching(/maxTokens|Invalid sampling request/),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("maxTokens number 1 passes Zod and residual gate", async () => {
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
