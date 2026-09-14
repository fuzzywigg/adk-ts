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
 * Twentieth leftover: image/audio `safeText(mimeType) || default` — string
 * `"0"`/`"false"`/`"true"` are non-empty strings so kept (thirteenth pinned
 * falsy/non-string → image/jpeg and whitespace keep).
 */
describe("mcp sampling mimeType string-zero/false/true keep twentieth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		"0",
		"false",
		"true",
	] as const)("image mimeType %j kept via safeText ||", (mimeType) => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType,
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType },
			},
		]);
	});

	it.each([
		"0",
		"false",
		"true",
	] as const)("audio mimeType %j kept via safeText ||", (mimeType) => {
		expect(
			convert({
				type: "audio",
				data: "abcd",
				mimeType,
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType },
			},
		]);
	});

	it('boolean true mimeType falls back (safeText non-string → "")', () => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				mimeType: true,
			}),
		).toEqual([
			{
				inlineData: { data: "abcd", mimeType: "image/jpeg" },
			},
		]);
	});
});
