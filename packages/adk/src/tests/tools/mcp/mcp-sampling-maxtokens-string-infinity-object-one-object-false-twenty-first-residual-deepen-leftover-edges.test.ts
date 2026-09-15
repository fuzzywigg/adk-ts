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
 * Twenty-first leftover residual deepen (complements #286 nan/posinf):
 * maxTokens Zod-number gate — `Object(1)` / `Object(false)` rejected as
 * non-number (before `<= 0`); string `"Infinity"` already Zod-rejected in #286.
 */
describe("mcp sampling maxTokens string-infinity/object-one/object-false twenty-first residual deepen", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
		{ label: 'string "Infinity"', value: "Infinity" },
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
});
