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
 * Twentieth leftover: image/audio optional text uses `"text" in` then
 * truthy `if (t)` after safeText — string "0"/"false" are pushed;
 * empty string still dropped (fourteenth).
 */
describe("mcp sampling image text string-zero/false keep twentieth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		"0",
		"false",
	] as const)("text: %j pushes text part then inlineData", (text) => {
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

	it('text: "" still omitted (fourteenth control)', () => {
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

	it("non-string text still ignored via safeText → ''", () => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: "image/png",
				text: 0 as any,
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "image/png" },
			},
		]);
	});
});
