import { afterEach, describe, expect, it } from "vitest";
import { McpBamm } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual complement after providers tip #269 / #259):
 * env `value !== undefined` then `String(value)` — boolean `true` / `"true"` /
 * `[]` / `-0` / `NaN` / `NEGATIVE_INFINITY` kept as strings. Thirteenth pinned
 * null→`"null"`; undefined still skipped.
 */
describe("mcp servers env true/negzero/nan stringify twentieth leftover complement", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it.each([
		{ key: "BOOL", value: true, expected: "true" },
		{ key: "STR", value: "true", expected: "true" },
		{ key: "ARR", value: [] as never[], expected: "" },
		{ key: "NEG0", value: -0, expected: "0" },
		{ key: "NAN", value: Number.NaN, expected: "NaN" },
		{
			key: "NINF",
			value: Number.NEGATIVE_INFINITY,
			expected: "-Infinity",
		},
	])("env $key=$value → String keep ($expected)", ({
		key,
		value,
		expected,
	}) => {
		process.env.PATH = "/bin";
		const env = (
			McpBamm({
				env: {
					WALLET_PRIVATE_KEY: "k",
					[key]: value as any,
				},
			}) as any
		).config.transport.env;
		expect(env[key]).toBe(expected);
	});
});
