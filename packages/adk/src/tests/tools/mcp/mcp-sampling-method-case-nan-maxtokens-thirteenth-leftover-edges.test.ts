import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpError, McpErrorType } from "../../../tools/mcp/types";
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
 * Thirteenth leftover: method uses !== "sampling/createMessage" (case-sensitive);
 * maxTokens NaN is truthy and NaN <= 0 is false so the gate lets it through.
 */
describe("mcp sampling method-case + NaN maxTokens thirteenth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		"Sampling/createMessage",
		"SAMPLING/CREATEMESSAGE",
		"sampling/CreateMessage",
		"sampling/createmessage",
	])("rejects method %j via !== (schema may also fail)", async (method) => {
		await expect(
			handler.handleSamplingRequest({
				method,
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: 8,
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("accepts exact sampling/createMessage (control)", async () => {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
				maxTokens: 8,
			},
		} as any);
		expect(handlerFn).toHaveBeenCalled();
	});

	it("NaN maxTokens is not caught by maxTokens <= 0 (NaN comparisons are false)", async () => {
		try {
			await handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: Number.NaN,
				},
			} as any);
			expect(handlerFn).toHaveBeenCalled();
			expect(handlerFn.mock.calls[0][0].config.maxOutputTokens).toBeNaN();
		} catch (error) {
			expect((error as Error).message).not.toMatch(
				/maxTokens must be a positive number/,
			);
		}
	});

	it("Infinity maxTokens is truthy and Infinity <= 0 is false", async () => {
		try {
			await handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: Number.POSITIVE_INFINITY,
				},
			} as any);
			expect(handlerFn).toHaveBeenCalled();
			expect(handlerFn.mock.calls[0][0].config.maxOutputTokens).toBe(
				Number.POSITIVE_INFINITY,
			);
		} catch (error) {
			expect((error as Error).message).not.toMatch(
				/maxTokens must be a positive number/,
			);
		}
	});
});
