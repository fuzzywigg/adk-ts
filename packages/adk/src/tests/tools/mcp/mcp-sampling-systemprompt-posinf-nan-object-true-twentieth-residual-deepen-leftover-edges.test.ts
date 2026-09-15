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
 * HEAVY tip-relaunch residual deepen after tip 1f70668 / post #286 (lands closed #278 onto tip; complements #259 true/negzero):
 * `if (systemPrompt)` prepend — POSITIVE_INFINITY / `1` / `{}` /
 * `Object(true)` prepend; `NaN` skips.
 */
describe("mcp sampling systemPrompt posinf/nan/object-true twentieth residual deepen", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
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

	it("skips prepend for systemPrompt NaN (falsy)", () => {
		const convert = (handler as any).convertMcpMessagesToADK.bind(handler);
		const contents = convert(
			[{ role: "user", content: { type: "text", text: "hello" } }],
			Number.NaN,
		);
		expect(contents).toHaveLength(1);
		expect(contents[0].parts[0].text).toBe("hello");
	});
});
