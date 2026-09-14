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
 * Fifteenth leftover: tool_use / tool_result use safeText on name/toolUseId.
 * Non-string falsy values coerce to empty brackets; `"0"` is kept.
 */
describe("mcp sampling tool-use safetext nonstring fifteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		0,
		false,
		null,
	] as const)("tool_use name %j → '[Tool Use: ]'", (name) => {
		expect(convert({ type: "tool_use", name })).toEqual([
			{ text: "[Tool Use: ]" },
		]);
	});

	it('tool_use name "0" is kept', () => {
		expect(convert({ type: "tool_use", name: "0" })).toEqual([
			{ text: "[Tool Use: 0]" },
		]);
	});

	it.each([
		0,
		false,
		null,
	] as const)("tool_result toolUseId %j → '[Tool Result: ]'", (toolUseId) => {
		expect(convert({ type: "tool_result", toolUseId })).toEqual([
			{ text: "[Tool Result: ]" },
		]);
	});

	it('tool_result toolUseId "0" is kept', () => {
		expect(convert({ type: "tool_result", toolUseId: "0" })).toEqual([
			{ text: "[Tool Result: 0]" },
		]);
	});
});
