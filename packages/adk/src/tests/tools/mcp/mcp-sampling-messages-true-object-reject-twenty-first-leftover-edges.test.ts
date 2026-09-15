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
 * Twenty-first leftover (HEAVY tip-relaunch residual after fourteenth classic
 * falsy messages): `!messages || !Array.isArray(messages)` — truthy non-arrays
 * `true` / `"true"` / `{}` / `NEGATIVE_INFINITY` reject.
 */
describe("mcp sampling messages true/object reject twenty-first leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		{ label: "boolean true", messages: true },
		{ label: '"true"', messages: "true" },
		{ label: "empty object", messages: {} },
		{ label: "NEGATIVE_INFINITY", messages: Number.NEGATIVE_INFINITY },
	])("rejects messages $label via !Array.isArray", async ({ messages }) => {
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
});
