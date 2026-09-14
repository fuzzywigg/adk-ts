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
 * Twentieth leftover (HEAVY tip-relaunch residual after eleventh systemPrompt):
 * `if (systemPrompt)` prepend — boolean `true` / `"true"` / `[]` /
 * `NEGATIVE_INFINITY` prepend; SameValueZero `-0` skips. Eleventh pinned
 * classic falsy + `"0"`/`"false"`/whitespace.
 */
describe("mcp sampling systemPrompt true/negzero twentieth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("prepends systemPrompt $label as user-role content", ({ value }) => {
		const convert = (handler as any).convertMcpMessagesToADK.bind(handler);
		const contents = convert(
			[{ role: "user", content: { type: "text", text: "hello" } }],
			value,
		);
		expect(contents[0]).toEqual({
			role: "user",
			parts: [{ text: value }],
		});
		expect(contents[1].parts[0].text).toBe("hello");
	});

	it("skips prepend for systemPrompt -0 (SameValueZero falsy)", () => {
		const convert = (handler as any).convertMcpMessagesToADK.bind(handler);
		const contents = convert(
			[{ role: "user", content: { type: "text", text: "hello" } }],
			-0,
		);
		expect(contents).toHaveLength(1);
		expect(contents[0].parts[0].text).toBe("hello");
	});
});
