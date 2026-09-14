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
 * Fourteenth leftover: systemPrompt gate is truthiness (`if (systemPrompt)`).
 * Numeric 0 was covered eleventh; string "0" / "false" are truthy and prepended.
 */
describe("mcp sampling systemprompt string-zero keep fourteenth leftover", () => {
	const handler = new McpSamplingHandler(async () => "ok");
	const convert = (handler as any).convertMcpMessagesToADK.bind(handler);

	it.each([
		"0",
		"false",
		" ",
	] as const)("systemPrompt %j is prepended as user content", (systemPrompt) => {
		const contents = convert([], systemPrompt);
		expect(contents).toEqual([
			{ role: "user", parts: [{ text: systemPrompt }] },
		]);
	});

	it("systemPrompt: 0 is still skipped (control vs string zero)", () => {
		expect(convert([], 0 as any)).toEqual([]);
	});
});
