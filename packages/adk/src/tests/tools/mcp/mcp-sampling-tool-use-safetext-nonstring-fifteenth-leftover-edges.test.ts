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
 * Fifteenth leftover: tool_use/tool_result use safeText — non-string
 * name/toolUseId become "" placeholders (unlike missing string ids which
 * still render empty brackets).
 */
describe("mcp sampling tool_use safeText nonstring fifteenth leftover", () => {
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handler = new McpSamplingHandler(vi.fn(async () => "ok"));
	});

	it.each([
		{ label: "0", name: 0 },
		{ label: "false", name: false },
		{ label: "null", name: null },
		{ label: "object", name: { n: 1 } },
	] as const)("tool_use name=$label becomes empty Tool Use placeholder", ({
		name,
	}) => {
		const convert = (handler as any).convertMcpContentToADKParts.bind(handler);
		expect(convert({ type: "tool_use", name })).toEqual([
			{ text: "[Tool Use: ]" },
		]);
	});

	it.each([
		{ label: "0", toolUseId: 0 },
		{ label: "false", toolUseId: false },
		{ label: "null", toolUseId: null },
	] as const)("tool_result toolUseId=$label becomes empty Tool Result", ({
		toolUseId,
	}) => {
		const convert = (handler as any).convertMcpContentToADKParts.bind(handler);
		expect(convert({ type: "tool_result", toolUseId })).toEqual([
			{ text: "[Tool Result: ]" },
		]);
	});

	it("string name/id still render (control)", () => {
		const convert = (handler as any).convertMcpContentToADKParts.bind(handler);
		expect(convert({ type: "tool_use", name: "search" })).toEqual([
			{ text: "[Tool Use: search]" },
		]);
		expect(convert({ type: "tool_result", toolUseId: "tr1" })).toEqual([
			{ text: "[Tool Result: tr1]" },
		]);
	});
});
