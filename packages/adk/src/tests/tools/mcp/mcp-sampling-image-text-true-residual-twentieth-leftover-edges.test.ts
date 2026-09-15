import { beforeEach, describe, expect, it, vi } from "vitest";
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
 * Twentieth leftover (HEAVY tip-relaunch residual complement after #259):
 * image/audio optional text `if (t)` after safeText — only string `"true"` is
 * kept among residual set (boolean/`[]`/`-0`/`-Infinity` coerce to `""` and
 * skip). Fourteenth pinned empty-string `"text" in` + whitespace data.
 */
describe("mcp sampling image text true residual twentieth leftover complement", () => {
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handler = new McpSamplingHandler(async () => "ok");
	});

	it('image text "true" kept as text part before inlineData', () => {
		const convert = (handler as any).convertMcpContentToADKParts.bind(handler);
		const parts = convert({
			type: "image",
			text: "true",
			data: "abc",
			mimeType: "image/png",
		});
		expect(parts[0]).toEqual({ text: "true" });
		expect(parts[1].inlineData.data).toBe("abc");
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: "empty array", value: [] as never[] },
		{ label: "-0", value: -0 },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])('image text $label safeText→"" so no text part', ({ value }) => {
		const convert = (handler as any).convertMcpContentToADKParts.bind(handler);
		const parts = convert({
			type: "image",
			text: value,
			data: "abc",
			mimeType: "image/png",
		});
		expect(parts).toHaveLength(1);
		expect(parts[0].inlineData).toBeDefined();
	});
});
