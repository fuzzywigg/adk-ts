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
 * HEAVY tip-relaunch residual deepen after tip 5156762 / post #292 (lands closed #290/#278 onto tip; complements #259 string-true mimeType):
 * `safeText(mimeType) || default` — only strings survive. `"Infinity"` kept;
 * `Object(true)` / POSITIVE_INFINITY / `NaN` / `1` → `""` → jpeg/mpeg.
 */
describe("mcp sampling mimeType string-infinity vs object-true twentieth residual deepen", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it('image mimeType "Infinity" kept via safeText || (string path)', () => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: "Infinity",
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "Infinity" },
			},
		]);
	});

	it.each([
		{ label: "Object(true)", mimeType: Object(true) },
		{ label: "POSITIVE_INFINITY", mimeType: Number.POSITIVE_INFINITY },
		{ label: "NaN", mimeType: Number.NaN },
		{ label: "number 1", mimeType: 1 },
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

	it('audio mimeType "Infinity" kept; Object(true) falls back to audio/mpeg', () => {
		expect(
			convert({
				type: "audio",
				data: "abcd",
				mimeType: "Infinity",
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "Infinity" },
			},
		]);
		expect(
			convert({
				type: "audio",
				data: "abcd",
				mimeType: Object(true),
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "audio/mpeg" },
			},
		]);
	});
});
