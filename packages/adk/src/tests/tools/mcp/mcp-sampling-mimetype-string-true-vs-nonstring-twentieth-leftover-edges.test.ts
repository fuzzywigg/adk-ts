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
 * Twentieth leftover (HEAVY tip-relaunch residual after thirteenth mimeType ||):
 * `safeText(mimeType) || default` — only strings survive safeText. `"true"`
 * kept; boolean `true` / `[]` / `-0` / `NEGATIVE_INFINITY` coerce to `""`
 * then fall back. Thirteenth pinned omitted/empty/null/0/whitespace.
 */
describe("mcp sampling mimeType string-true vs nonstring twentieth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it('image mimeType "true" kept via safeText || (string path)', () => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: "true",
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "true" },
			},
		]);
	});

	it.each([
		{ label: "boolean true", mimeType: true },
		{ label: "empty array", mimeType: [] as never[] },
		{ label: "-0", mimeType: -0 },
		{ label: "NEGATIVE_INFINITY", mimeType: Number.NEGATIVE_INFINITY },
	])('image $label mimeType → safeText "" → image/jpeg default', ({
		mimeType,
	}) => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType,
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "image/jpeg" },
			},
		]);
	});

	it('audio mimeType "true" kept; boolean true falls back to audio/mpeg', () => {
		expect(
			convert({
				type: "audio",
				data: "abcd",
				mimeType: "true",
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "true" },
			},
		]);
		expect(
			convert({
				type: "audio",
				data: "abcd",
				mimeType: true,
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "audio/mpeg" },
			},
		]);
	});
});
