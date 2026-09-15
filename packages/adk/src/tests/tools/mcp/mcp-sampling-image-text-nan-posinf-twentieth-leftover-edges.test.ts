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
 * Twentieth leftover (HEAVY tip-relaunch residual after providers tip #269):
 * image/audio optional text `if (t)` after safeText — complements closed #271
 * `"true"` keep / true/`[]`/`-0`/`-Infinity` skip with string `"Infinity"` keep;
 * `POSITIVE_INFINITY` / `NaN` / `Object(true)` / `1` → `""` skip.
 */
describe("mcp sampling image text nan/posinf twentieth leftover heavy", () => {
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
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NaN", value: Number.NaN },
		{ label: "Object(true)", value: Object(true) },
		{ label: "number 1", value: 1 },
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
