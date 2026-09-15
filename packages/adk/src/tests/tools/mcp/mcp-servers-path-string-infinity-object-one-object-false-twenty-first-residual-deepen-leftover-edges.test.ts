import { afterEach, describe, expect, it } from "vitest";
import { McpMemory, McpTelegram } from "../../../tools/mcp/servers";

/**
 * Twenty-first leftover residual deepen (complements #286 posinf/nan/object-true):
 * createMcpConfig `String(value)` then `if (!env.PATH)` — string `"Infinity"` /
 * `Object(1)` / `Object(false)` String-coercion keep (truthy strings).
 */
describe("mcp servers PATH string-infinity/object-one/object-false twenty-first residual deepen", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it.each([
		{ label: 'string "Infinity"', value: "Infinity", expected: "Infinity" },
		{ label: "Object(1)", value: Object(1), expected: "1" },
		{ label: "Object(false)", value: Object(false), expected: "false" },
	])("PATH $label String-coerced and kept (truthy)", ({ value, expected }) => {
		process.env.PATH = "/from-process";
		const env = (
			McpTelegram({
				env: { TELEGRAM_BOT_TOKEN: "t", PATH: value as any },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe(expected);
	});

	it("PATH Object(1) via McpMemory also keeps String-coerced 1", () => {
		process.env.PATH = "/from-process";
		const env = (
			McpMemory({
				env: { PATH: Object(1) as any },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("1");
	});
});
