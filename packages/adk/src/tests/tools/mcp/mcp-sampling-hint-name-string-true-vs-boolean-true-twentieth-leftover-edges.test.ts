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
 * Twentieth leftover: hints.find((h) => h?.name) — string "true" kept;
 * boolean name fails CreateMessageRequestSchema before the leftover gate
 * (eleventh already pins "0"/"false" keep).
 */
describe("mcp sampling hint name string-true vs boolean-true twentieth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	async function modelForHints(hints: unknown) {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
				maxTokens: 8,
				modelPreferences: { hints },
			},
		} as any);
		return handlerFn.mock.calls[0][0].model;
	}

	it('hint.name "true" kept as string via truthy find', async () => {
		expect(await modelForHints([{ name: "true" }, { name: "later" }])).toBe(
			"true",
		);
	});

	it.each([
		true,
		false,
	] as const)("hint.name boolean %j rejected at schema before leftover gate", async (name) => {
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
			message: expect.stringMatching(/expected string|Invalid input/i),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it('hint.name "false" still kept (eleventh control)', async () => {
		expect(await modelForHints([{ name: "false" }])).toBe("false");
	});
});
