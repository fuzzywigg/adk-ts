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
 * Twenty-first leftover residual deepen (complements #286 nan/posinf):
 * image optional text `if (t)` after safeText — string `"Infinity"` keep;
 * `Object(1)` / `Object(false)` → `""` skip (non-string safeText).
 */
describe("mcp sampling image text string-infinity/object-one/object-false twenty-first residual deepen", () => {
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handler = new McpSamplingHandler(async () => "ok");
	});

	it('image text "Infinity" kept as text part before inlineData', () => {
		const convert = (handler as any).convertMcpContentToADKParts.bind(handler);
		const parts = convert({
			type: "image",
			text: "Infinity",
			data: "abc",
			mimeType: "image/png",
		});
		expect(parts[0]).toEqual({ text: "Infinity" });
		expect(parts[1].inlineData.data).toBe("abc");
	});

	it.each([
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
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
