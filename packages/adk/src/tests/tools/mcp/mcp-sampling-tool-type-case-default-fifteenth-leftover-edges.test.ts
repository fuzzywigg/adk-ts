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
 * Fifteenth leftover: switch on exact `tool_use` / `tool_result`. Upper/mixed
 * case falls to default unknown (sibling of fourteenth TEXT/IMAGE case).
 */
describe("mcp sampling tool-type case default fifteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		"TOOL_USE",
		"Tool_Use",
		"TOOL_RESULT",
		"Tool_Result",
	] as const)("type %j falls to unknown default", (type) => {
		expect(convert({ type, name: "x", toolUseId: "y" } as any)).toEqual([
			{ text: "[Unknown content type]" },
		]);
	});

	it("exact tool_use still formats name (control)", () => {
		expect(convert({ type: "tool_use", name: "search" })).toEqual([
			{ text: "[Tool Use: search]" },
		]);
	});

	it("exact tool_result still formats toolUseId (control)", () => {
		expect(convert({ type: "tool_result", toolUseId: "tr1" })).toEqual([
			{ text: "[Tool Result: tr1]" },
		]);
	});
});
