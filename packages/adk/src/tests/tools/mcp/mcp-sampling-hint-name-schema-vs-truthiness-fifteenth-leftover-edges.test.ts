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
 * Fifteenth leftover: schema requires hint.name to be string — boolean /
 * number / null reject at safeParse before `hints.find((h) => h?.name)`.
 * Empty-string name still reaches the truthiness find (eleventh leftover).
 */
describe("mcp sampling hint name schema-vs-truthiness fifteenth leftover", () => {
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
		{ label: "boolean false", name: false },
		{ label: "number 0", name: 0 },
		{ label: "null", name: null },
		{ label: "true", name: true },
	] as const)("non-string hint.name ($label) rejected by schema", async ({
		name,
	}) => {
		await expect(
			requestWithHints([{ name }, { name: "kept" }]),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringMatching(/expected string|Invalid input/i),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("empty-string name still reaches truthiness find → fallback (control)", async () => {
		await requestWithHints([{ name: "" }]);
		expect(handlerFn.mock.calls[0][0].model).toBe("gemini-2.0-flash");
	});

	it('string "0" still kept by truthiness find (control)', async () => {
		await requestWithHints([{ name: "0" }, { name: "later" }]);
		expect(handlerFn.mock.calls[0][0].model).toBe("0");
	});
});
