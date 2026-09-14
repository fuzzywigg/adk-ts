import { beforeEach, describe, expect, it, vi } from "vitest";
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
 * Eleventh leftover: hints.find((h) => h?.name) is truthiness, not
 * nullish-only. Empty/"0"/whitespace names therefore skip or keep.
 */
describe("mcp sampling hint name truthiness eleventh leftover", () => {
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

	it("skips empty-string hint.name then uses the next named hint", async () => {
		expect(await modelForHints([{ name: "" }, { name: "kept" }])).toBe("kept");
	});

	it("skips missing name ({}) then uses the next named hint", async () => {
		expect(await modelForHints([{}, { name: "kept" }])).toBe("kept");
	});

	it('keeps hint.name "0" (truthy string) instead of falling through', async () => {
		expect(await modelForHints([{ name: "0" }, { name: "later" }])).toBe("0");
	});

	it("keeps whitespace-only hint.name (truthy)", async () => {
		expect(await modelForHints([{ name: "   " }])).toBe("   ");
	});

	it('keeps hint.name "false" (truthy string) instead of treating it as boolean false', async () => {
		expect(await modelForHints([{ name: "false" }])).toBe("false");
	});

	it("all empty/missing hint names fall back to gemini-2.0-flash", async () => {
		expect(await modelForHints([{ name: "" }, {}])).toBe("gemini-2.0-flash");
	});
});
