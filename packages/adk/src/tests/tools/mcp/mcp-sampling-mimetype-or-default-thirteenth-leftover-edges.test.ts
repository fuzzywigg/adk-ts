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
 * Thirteenth leftover: image/audio mimeType uses `safeText(mimeType) || default`
 * — ""/non-string fall back; whitespace is kept.
 */
describe("mcp sampling mimeType or-default thirteenth leftover edges", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		{ label: "omitted", mimeType: undefined, expected: "image/jpeg" },
		{ label: "empty string", mimeType: "", expected: "image/jpeg" },
		{ label: "null", mimeType: null, expected: "image/jpeg" },
		{ label: "0", mimeType: 0, expected: "image/jpeg" },
	])("image $label mimeType falls back to image/jpeg", ({
		mimeType,
		expected,
	}) => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType,
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: expected },
			},
		]);
	});

	it("audio empty mimeType falls back to audio/mpeg", () => {
		expect(
			convert({
				type: "audio",
				data: "abcd",
				mimeType: "",
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "audio/mpeg" },
			},
		]);
	});

	it("whitespace mimeType is kept (truthy || skip)", () => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: " ",
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: " " },
			},
		]);
	});

	it("explicit mimeType is kept (control)", () => {
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
});
