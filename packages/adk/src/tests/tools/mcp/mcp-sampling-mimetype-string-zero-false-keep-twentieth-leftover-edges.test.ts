import { describe, expect, it, vi } from "vitest";
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
 * Twentieth leftover: image/audio `safeText(mimeType) || default` —
 * string "0"/"false" kept; numeric 0 still defaults (thirteenth).
 */
describe("mcp sampling mimeType string-zero/false keep twentieth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		"0",
		"false",
	] as const)("image mimeType: %j kept via ||", (mimeType) => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType,
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType },
			},
		]);
	});

	it('audio mimeType: "0" kept', () => {
		expect(
			convert({
				type: "audio",
				data: "abcd",
				mimeType: "0",
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "0" },
			},
		]);
	});

	it("numeric 0 still → image/jpeg (thirteenth control)", () => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: 0,
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "image/jpeg" },
			},
		]);
	});
});
