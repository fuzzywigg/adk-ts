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
 * Fourteenth leftover: hasData is `typeof data === "string" && data.length > 0`.
 * Whitespace " " / "\\t" count as valid binary payload (not MISSING DATA).
 */
describe("mcp sampling whitespace data valid fourteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		" ",
		"\t",
		"\n",
	] as const)("image data %j is truthy-length so becomes inlineData", (data) => {
		expect(
			convert({
				type: "image",
				data,
				mimeType: "image/png",
			}),
		).toEqual([
			{
				inlineData: { data, mimeType: "image/png" },
			},
		]);
	});

	it('empty data "" still yields MISSING DATA placeholder (control)', () => {
		expect(convert({ type: "image", data: "" })).toEqual([
			{ text: "[IMAGE CONTENT MISSING DATA]" },
		]);
	});

	it("audio whitespace data is also treated as present", () => {
		expect(
			convert({
				type: "audio",
				data: " ",
				mimeType: "audio/wav",
			}),
		).toEqual([
			{
				inlineData: { data: " ", mimeType: "audio/wav" },
			},
		]);
	});
});
