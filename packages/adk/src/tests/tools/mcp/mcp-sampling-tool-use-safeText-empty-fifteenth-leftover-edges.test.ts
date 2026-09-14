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
 * Fifteenth leftover: tool_use/tool_result use safeText — non-string name /
 * toolUseId become "" so labels render as `[Tool Use: ]` / `[Tool Result: ]`.
 */
describe("mcp sampling tool-use safeText empty fifteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		0,
		null,
		{},
		true,
	] as const)("tool_use name=%j becomes empty via safeText", (name) => {
		expect(convert({ type: "tool_use", name } as any)).toEqual([
			{ text: "[Tool Use: ]" },
		]);
	});

	it.each([
		0,
		null,
		false,
	] as const)("tool_result toolUseId=%j becomes empty via safeText", (toolUseId) => {
		expect(convert({ type: "tool_result", toolUseId } as any)).toEqual([
			{ text: "[Tool Result: ]" },
		]);
	});

	it("string name/toolUseId still kept (control)", () => {
		expect(convert({ type: "tool_use", name: "search" })).toEqual([
			{ text: "[Tool Use: search]" },
		]);
		expect(convert({ type: "tool_result", toolUseId: "tr1" })).toEqual([
			{ text: "[Tool Result: tr1]" },
		]);
	});
});
