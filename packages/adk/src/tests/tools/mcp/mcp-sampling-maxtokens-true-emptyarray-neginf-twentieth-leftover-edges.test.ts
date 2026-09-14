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
 * Twentieth leftover (HEAVY tip-relaunch residual complement after #259):
 * maxTokens Zod-number gate then `!maxTokens || maxTokens <= 0` — boolean
 * `true` / `"true"` / `[]` rejected at Zod (non-number); `NEGATIVE_INFINITY`
 * rejected (Zod Infinity and/or `<= 0`). Contrasts thirteenth `POSITIVE_INFINITY`
 * / `NaN` pass and fourteenth `-0` falsy gate.
 */
describe("mcp sampling maxTokens true/emptyarray/neginf twentieth leftover complement", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("maxTokens $label rejected (Zod and/or <= 0 gate)", async ({ value }) => {
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
