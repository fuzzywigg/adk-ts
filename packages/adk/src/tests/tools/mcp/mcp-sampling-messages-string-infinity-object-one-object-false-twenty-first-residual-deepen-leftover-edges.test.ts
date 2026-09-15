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
 * `!messages || !Array.isArray(messages)` — string `"Infinity"` / `Object(1)` /
 * `Object(false)` reject (truthy non-array).
 */
describe("mcp sampling messages string-infinity/object-one/object-false twenty-first residual deepen", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("rejects messages=$label via !messages / !Array.isArray", async ({
		value,
	}) => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: { messages: value, maxTokens: 8 },
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringMatching(/messages|Invalid sampling request/),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});
});
