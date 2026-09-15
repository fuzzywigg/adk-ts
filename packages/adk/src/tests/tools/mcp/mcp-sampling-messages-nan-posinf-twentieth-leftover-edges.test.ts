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
 * `!messages || !Array.isArray(messages)` — complements closed #271 true/
 * `"true"`/`{}`/`-0`/`-Infinity` reject with `POSITIVE_INFINITY` / `NaN` /
 * `Object(true)` / `1` reject (truthy non-array or falsy NaN).
 */
describe("mcp sampling messages nan/posinf twentieth leftover heavy", () => {
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
		{ label: "number 1", value: 1 },
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
			message: expect.stringContaining("messages"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});
});
