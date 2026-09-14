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
 * Fifteenth leftover: image/audio `typeof data === "string" && length > 0`.
 * Non-string data fails the gate (whitespace/`""` already fourteenth).
 */
describe("mcp sampling data nonstring missing fifteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		{ label: "null", data: null },
		{ label: "0", data: 0 },
		{ label: "false", data: false },
		{ label: "[]", data: [] },
		{ label: "undefined", data: undefined },
	] as const)("image data $label yields MISSING DATA placeholder", ({
		data,
	}) => {
		expect(
			convert({
				type: "image",
				data,
				mimeType: "image/png",
			}),
		).toEqual([{ text: "[IMAGE CONTENT MISSING DATA]" }]);
	});

	it("string data still yields inlineData (control)", () => {
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
