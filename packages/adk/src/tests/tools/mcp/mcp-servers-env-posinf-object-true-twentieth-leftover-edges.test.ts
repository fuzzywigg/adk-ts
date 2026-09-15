import { afterEach, describe, expect, it } from "vitest";
import { McpBamm } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after providers tip #269):
 * env `value !== undefined` then `String(value)` — complements closed #271
 * true/`[]`/`-0`/`NaN`/`-Infinity` pins with `POSITIVE_INFINITY` /
 * `Object(true)` / `{}` String keep.
 */
describe("mcp servers env posinf/object-true twentieth leftover heavy", () => {
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
			key: "PINF",
			value: Number.POSITIVE_INFINITY,
			expected: "Infinity",
		},
		{ key: "BOX", value: Object(true), expected: "true" },
		{ key: "OBJ", value: {}, expected: "[object Object]" },
		{ key: "ONE", value: 1, expected: "1" },
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
