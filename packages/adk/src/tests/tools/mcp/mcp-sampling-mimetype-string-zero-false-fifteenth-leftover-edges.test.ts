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
 * Fifteenth leftover: image/audio `safeText(mimeType) || default` — thirteenth
 * pins ""/non-string → default and whitespace keep. String `"0"` / `"false"`
 * are truthy after safeText and kept (asymmetry vs numeric 0 → default).
 */
describe("mcp sampling mimeType string-zero-false keep fifteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		"0",
		"false",
	])('image mimeType "%s" is kept (not image/jpeg)', (mimeType) => {
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

	it.each([
		"0",
		"false",
	])('audio mimeType "%s" is kept (not audio/mpeg)', (mimeType) => {
		expect(
			convert({
				type: "audio",
				data: "abcd",
				mimeType,
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType },
			},
		]);
	});

	it("numeric 0 still falls back to image/jpeg (thirteenth control)", () => {
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
