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
 * Twenty-first leftover (HEAVY tip-relaunch residual after fourteenth empty
 * `text: ""` / twentieth mimeType): image optional `text` via `safeText` then
 * `if (t)` — string `"true"` / `"0"` pushed; boolean `true` / `[]` / `-0` /
 * `NEGATIVE_INFINITY` → `""` → not pushed. Same for `tool_use.name`.
 */
describe("mcp sampling safetext true vs string-true twenty-first leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		{ label: '"true"', text: "true" },
		{ label: '"0"', text: "0" },
	])("image text $label kept via safeText then if (t)", ({ text }) => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				text,
			}),
		).toEqual([
			{ text },
			{ inlineData: { data: "abcd", mimeType: "image/jpeg" } },
		]);
	});

	it.each([
		{ label: "boolean true", text: true },
		{ label: "empty array", text: [] as never[] },
		{ label: "-0", text: -0 },
		{ label: "NEGATIVE_INFINITY", text: Number.NEGATIVE_INFINITY },
	])('image text $label → safeText "" → not pushed', ({ text }) => {
		expect(
			convert({
				type: "image",
				data: "abcd",
				text,
			}),
		).toEqual([{ inlineData: { data: "abcd", mimeType: "image/jpeg" } }]);
	});

	it('tool_use name "true" kept; boolean true → empty placeholder', () => {
		expect(convert({ type: "tool_use", name: "true" })).toEqual([
			{ text: "[Tool Use: true]" },
		]);
		expect(convert({ type: "tool_use", name: true })).toEqual([
			{ text: "[Tool Use: ]" },
		]);
	});
});
