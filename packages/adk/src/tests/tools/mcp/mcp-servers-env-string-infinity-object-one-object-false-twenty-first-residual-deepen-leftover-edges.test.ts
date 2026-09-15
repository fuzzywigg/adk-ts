import { afterEach, describe, expect, it } from "vitest";
import { McpBamm } from "../../../tools/mcp/servers";

/**
 * Twenty-first leftover residual deepen (complements #286 posinf/object-true):
 * env `value !== undefined` then `String(value)` — string `"Infinity"` /
 * `Object(1)` / `Object(false)` String keep.
 */
describe("mcp servers env string-infinity/object-one/object-false twenty-first residual deepen", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it.each([
		{ key: "SINF", value: "Infinity", expected: "Infinity" },
		{ key: "BOX1", value: Object(1), expected: "1" },
		{ key: "BOXF", value: Object(false), expected: "false" },
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
