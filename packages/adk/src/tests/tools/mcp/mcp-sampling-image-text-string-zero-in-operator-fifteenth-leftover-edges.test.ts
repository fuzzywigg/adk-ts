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
 * Fifteenth leftover: `"text" in` then safeText + truthy `if (t)`.
 * `text: "0"` / `" "` are pushed; non-string `0`/`false` coerce to "" and
 * are not pushed (fourteenth only covered empty string).
 */
describe("mcp sampling image text string-zero in-operator fifteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it('image text: "0" is truthy after safeText so a text part is pushed', () => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: "image/png",
				text: "0",
			}),
		).toEqual([
			{ text: "0" },
			{ inlineData: { data: "abcd", mimeType: "image/png" } },
		]);
	});

	it("image text: whitespace-only is truthy and pushed", () => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: "image/png",
				text: " ",
			}),
		).toEqual([
			{ text: " " },
			{ inlineData: { data: "abcd", mimeType: "image/png" } },
		]);
	});

	it.each([
		0,
		false,
	] as const)("image text: %j is non-string so safeText yields empty and no text part", (text) => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: "image/png",
				text,
			}),
		).toEqual([{ inlineData: { data: "abcd", mimeType: "image/png" } }]);
	});
});
