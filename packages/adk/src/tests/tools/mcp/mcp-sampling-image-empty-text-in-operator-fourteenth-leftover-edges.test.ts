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
 * Fourteenth leftover: image/audio optional text uses `"text" in` then
 * truthy `if (t)` after safeText — empty string is present but not pushed.
 */
describe("mcp sampling image empty-text in-operator fourteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it('image with text: "" yields only inlineData (no empty text part)', () => {
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

	it("image without text key yields only inlineData (control)", () => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: "image/png",
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "image/png" },
			},
		]);
	});

	it("image with non-empty text pushes text then inlineData", () => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: "image/png",
				text: "caption",
			}),
		).toEqual([
			{ text: "caption" },
			{
				inlineData: { data: "abcd", mimeType: "image/png" },
			},
		]);
	});
});
