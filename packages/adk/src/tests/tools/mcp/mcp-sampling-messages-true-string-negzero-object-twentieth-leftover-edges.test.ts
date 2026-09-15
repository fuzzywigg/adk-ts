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
 * Twentieth leftover (HEAVY tip-relaunch residual complement after providers tip #269 / #259):
 * `!messages || !Array.isArray(messages)` — boolean `true` / `"true"` / `{}` /
 * SameValueZero `-0` rejected (truthy non-array or falsy). Fourteenth pinned
 * classic falsy + empty-array control pass.
 */
describe("mcp sampling messages true/string/negzero/object twentieth leftover complement", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty object", value: {} },
		{ label: "-0", value: -0 },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
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
