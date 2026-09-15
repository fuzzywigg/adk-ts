import { afterEach, describe, expect, it } from "vitest";
import { McpMemory, McpTelegram } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after providers tip #269):
 * createMcpConfig `String(value)` then `if (!env.PATH)` — complements closed
 * #271 true/`"true"`/`-0`/`-Infinity`/`[]` pins with `POSITIVE_INFINITY` /
 * `NaN` / `{}` / `Object(true)` / `1` String-coercion keep.
 */
describe("mcp servers PATH nan/posinf/object-true twentieth leftover heavy", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it.each([
		{
			label: "POSITIVE_INFINITY",
			value: Number.POSITIVE_INFINITY,
			expected: "Infinity",
		},
		{ label: "NaN", value: Number.NaN, expected: "NaN" },
		{ label: "{}", value: {}, expected: "[object Object]" },
		{ label: "Object(true)", value: Object(true), expected: "true" },
		{ label: "number 1", value: 1, expected: "1" },
	])("PATH $label String-coerced and kept (truthy)", ({ value, expected }) => {
		process.env.PATH = "/from-process";
		const env = (
			McpTelegram({
				env: { TELEGRAM_BOT_TOKEN: "t", PATH: value as any },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe(expected);
	});

	it('PATH Object(false) String-coerces to "false" and kept (truthy string)', () => {
		process.env.PATH = "/from-process";
		const env = (
			McpMemory({
				env: { PATH: Object(false) as any },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("false");
	});
});
