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
 * Fifteenth leftover: hints[].name must be string per Zod — boolean false /
 * numeric 0 never reach `h?.name` truthiness; Zod rejects first. String "0"
 * still kept (eleventh).
 */
describe("mcp sampling hint name false zod-reject fifteenth leftover", () => {
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

	it.each([
		false,
		0,
	] as const)("name: %j is rejected by Zod before find truthiness", async (name) => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: 8,
					modelPreferences: { hints: [{ name }, { name: "later" }] },
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("Invalid sampling request"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it('keeps name: "0" (control truthy string)', async () => {
		expect(await modelForHints([{ name: "0" }, { name: "later" }])).toBe("0");
	});
});
