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
 * Fourteenth leftover: switch (mcpContent.type) is case-sensitive.
 * "TEXT" / "IMAGE" / "Audio" hit default → "[Unknown content type]".
 */
describe("mcp sampling content-type case default fourteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpContentToADKParts.bind(handler);

	it.each([
		"TEXT",
		"Text",
		"IMAGE",
		"Image",
		"AUDIO",
		"Audio",
	] as const)("type %j hits default unknown branch", (type) => {
		expect(convert({ type, text: "hi", data: "abcd" })).toEqual([
			{ text: "[Unknown content type]" },
		]);
	});

	it('exact "text" still maps (control)', () => {
		expect(convert({ type: "text", text: "hi" })).toEqual([{ text: "hi" }]);
	});
});
