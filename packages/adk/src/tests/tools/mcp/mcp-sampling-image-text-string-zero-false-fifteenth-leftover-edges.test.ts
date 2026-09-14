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
 * Fifteenth leftover: image/audio optional text uses `"text" in` then truthy
 * `if (t)` after safeText — fourteenth pins `text: ""` drop. String `"0"` /
 * `"false"` are truthy and pushed before inlineData.
 */
describe("mcp sampling image text string-zero-false keep fifteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		"0",
		"false",
	])('image text "%s" is pushed before inlineData', (text) => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: "image/png",
				text,
			}),
		).toEqual([
			{ text },
			{
				inlineData: { data: "abcd", mimeType: "image/png" },
			},
		]);
	});

	it.each([
		"0",
		"false",
	])('audio text "%s" is pushed before inlineData', (text) => {
		expect(
			convert({
				type: "audio",
				data: "abcd",
				mimeType: "audio/wav",
				text,
			}),
		).toEqual([
			{ text },
			{
				inlineData: { data: "abcd", mimeType: "audio/wav" },
			},
		]);
	});

	it("empty text still drops (fourteenth control)", () => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: "image/png",
				text: "",
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "image/png" },
			},
		]);
	});
});
