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
 * Fifteenth leftover: CreateMessageRequestSchema validates hint.name as
 * string before `hints.find((h) => h?.name)` truthiness runs — non-string
 * names are rejected (eleventh only exercised string forms).
 */
describe("mcp sampling hint name schema-reject nonstring fifteenth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	async function requestWithHints(hints: unknown) {
		return handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
				maxTokens: 8,
				modelPreferences: { hints },
			},
		} as any);
	}

	it.each([
		0,
		false,
		null,
	] as const)("rejects hint.name %j via schema before truthiness find", async (name) => {
		await expect(requestWithHints([{ name }])).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringMatching(/Invalid sampling request/),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it('keeps hint.name "0" after schema validation (truthy string control)', async () => {
		await requestWithHints([{ name: "0" }, { name: "later" }]);
		expect(handlerFn.mock.calls[0][0].model).toBe("0");
	});

	it("rejects NaN hint.name via schema", async () => {
		await expect(
			requestWithHints([{ name: Number.NaN }]),
		).rejects.toBeInstanceOf(McpError);
		expect(handlerFn).not.toHaveBeenCalled();
	});
});
