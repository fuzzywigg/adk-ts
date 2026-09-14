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
 * Twentieth leftover: `if (systemPrompt)` and `hints.find((h) => h?.name)?.name ||`
 * — string `"true"` kept (fourteenth/eleventh pinned `"0"`/`"false"`). Boolean
 * hint names never reach the `||` path: Zod rejects them first (asymmetry vs
 * string `"true"`).
 */
describe("mcp sampling systemPrompt/hint string-true twentieth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it('systemPrompt: "true" is prepended as user content', () => {
		const convert = (handler as any).convertMcpMessagesToADK.bind(handler);
		expect(convert([], "true")).toEqual([
			{ role: "user", parts: [{ text: "true" }] },
		]);
	});

	it("systemPrompt: boolean true is prepended (truthy if)", () => {
		const convert = (handler as any).convertMcpMessagesToADK.bind(handler);
		expect(convert([], true)).toEqual([
			{ role: "user", parts: [{ text: true }] },
		]);
	});

	it('hint.name "true" kept instead of falling through to gemini default', async () => {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
				maxTokens: 8,
				modelPreferences: { hints: [{ name: "true" }] },
			},
		} as any);
		expect(handlerFn.mock.calls[0][0].model).toBe("true");
	});

	it.each([
		true,
		false,
	] as const)("hint.name boolean %j rejected by Zod before || find (asymmetry vs string true)", async (name) => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: 8,
					modelPreferences: { hints: [{ name }] },
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("Invalid sampling request"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});
});
