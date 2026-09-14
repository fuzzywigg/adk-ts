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
 * Fifteenth leftover: hasData is `typeof data === "string" && data.length > 0`.
 * String "0" has length 1 → valid inlineData (whitespace covered fourteenth).
 */
describe("mcp sampling data string-zero valid fifteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it('image data: "0" becomes inlineData', () => {
		expect(
			convert({
				type: "image",
				data: "0",
				mimeType: "image/png",
			}),
		).toEqual([{ inlineData: { data: "0", mimeType: "image/png" } }]);
	});

	it('audio data: "0" becomes inlineData', () => {
		expect(
			convert({
				type: "audio",
				data: "0",
				mimeType: "audio/wav",
			}),
		).toEqual([{ inlineData: { data: "0", mimeType: "audio/wav" } }]);
	});

	it('empty data "" still yields MISSING DATA (control)', () => {
		expect(convert({ type: "image", data: "" })).toEqual([
			{ text: "[IMAGE CONTENT MISSING DATA]" },
		]);
	});
});
