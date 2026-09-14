import { afterEach, describe, expect, it } from "vitest";
import { McpMemory, McpTelegram } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual complement after #259):
 * createMcpConfig `String(value)` then `if (!env.PATH)` — boolean `true` /
 * `"true"` / `-0` → `"0"` / `-Infinity` keep; `[]` → `""` overwritten.
 * Fourteenth pinned string `"0"`/`"false"` keep; thirteenth empty overwrite.
 */
describe("mcp servers PATH true/string/emptyarray twentieth leftover complement", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it.each([
		{ label: "boolean true", value: true, expected: "true" },
		{ label: '"true"', value: "true", expected: "true" },
		{ label: "-0", value: -0, expected: "0" },
		{
			label: "NEGATIVE_INFINITY",
			value: Number.NEGATIVE_INFINITY,
			expected: "-Infinity",
		},
	])("PATH $label String-coerced and kept (truthy)", ({ value, expected }) => {
		process.env.PATH = "/from-process";
		const env = (
			McpTelegram({
				env: { TELEGRAM_BOT_TOKEN: "t", PATH: value as any },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe(expected);
	});

	it('PATH: [] String-coerces to "" then overwritten by process.env.PATH', () => {
		process.env.PATH = "/from-process";
		const env = (
			McpMemory({
				env: { PATH: [] as any },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("/from-process");
	});

	it('missing PATH falls through to process.env.PATH || ""', () => {
		delete process.env.PATH;
		const env = (
			McpTelegram({
				env: { TELEGRAM_BOT_TOKEN: "t" },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("");
	});
});
