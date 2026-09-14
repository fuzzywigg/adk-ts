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
 * Fifteenth leftover: `!messages || !Array.isArray(messages)` — plain `{}` is
 * truthy but not an array, so rejected. Fourteenth covered null/false/0/"".
 */
describe("mcp sampling messages object-not-array fifteenth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it("rejects messages: {} via !Array.isArray", async () => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: { messages: {}, maxTokens: 8 },
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("messages"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("empty array still passes messages gate (control)", async () => {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: { messages: [], maxTokens: 8 },
		} as any);
		expect(handlerFn).toHaveBeenCalled();
	});
});
