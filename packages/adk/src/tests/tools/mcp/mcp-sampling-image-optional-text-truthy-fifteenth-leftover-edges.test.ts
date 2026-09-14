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
 * Fifteenth leftover: optional image/audio text uses `if (t)` after safeText.
 * "0" / " " kept as caption parts; "" / non-string skipped.
 */
describe("mcp sampling image optional text truthy fifteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it('keeps optional text "0" before inlineData', () => {
		expect(
			convert({
				type: "image",
				text: "0",
				data: "abc",
				mimeType: "image/png",
			}),
		).toEqual([
			{ text: "0" },
			{ inlineData: { data: "abc", mimeType: "image/png" } },
		]);
	});

	it("keeps whitespace-only optional text", () => {
		expect(
			convert({
				type: "audio",
				text: " ",
				data: "xyz",
				mimeType: "audio/mpeg",
			}),
		).toEqual([
			{ text: " " },
			{ inlineData: { data: "xyz", mimeType: "audio/mpeg" } },
		]);
	});

	it("skips empty-string optional text (control)", () => {
		expect(
			convert({
				type: "image",
				text: "",
				data: "abc",
				mimeType: "image/png",
			}),
		).toEqual([{ inlineData: { data: "abc", mimeType: "image/png" } }]);
	});

	it("skips non-string optional text via safeText (control)", () => {
		expect(
			convert({
				type: "image",
				text: 0 as any,
				data: "abc",
				mimeType: "image/png",
			}),
		).toEqual([{ inlineData: { data: "abc", mimeType: "image/png" } }]);
	});
});
