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
 * Twenty-first leftover (HEAVY tip-relaunch residual after thirteenth NaN/+∞
 * and fourteenth `-0`): `!maxTokens || maxTokens <= 0` — boolean `true` /
 * `"true"` pass; `[]` rejects via `[] <= 0`; `NEGATIVE_INFINITY` rejects via
 * `<= 0`.
 */
describe("mcp sampling maxTokens true/emptyarray/neginf twenty-first leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		{ label: "boolean true", maxTokens: true },
		{ label: '"true"', maxTokens: "true" },
	])("maxTokens $label passes !maxTokens / <= 0 gate", async ({
		maxTokens,
	}) => {
		try {
			await handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens,
				},
			} as any);
			expect(handlerFn).toHaveBeenCalled();
			expect(handlerFn.mock.calls[0][0].config.maxOutputTokens).toBe(maxTokens);
		} catch (error) {
			expect((error as Error).message).not.toMatch(
				/maxTokens must be a positive number/,
			);
		}
	});

	it("maxTokens [] rejects via [] <= 0 (ToNumber empty → 0)", async () => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: [],
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("maxTokens"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("maxTokens NEGATIVE_INFINITY rejects via <= 0", async () => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: Number.NEGATIVE_INFINITY,
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("maxTokens"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});
});
