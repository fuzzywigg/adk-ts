import { afterEach, describe, expect, it } from "vitest";
import { McpMemory, McpTelegram } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover: fourteenth pins PATH `"0"`/`"false"` keep via `if (!env.PATH)`.
 * Boolean `true` / `"true"` kept after String(); SameValueZero `-0` is falsy and
 * overwritten by process.env.PATH.
 */
describe("mcp servers PATH true/string-true/negzero twentieth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it('PATH boolean true becomes "true" and is kept (truthy)', () => {
		process.env.PATH = "/from-process";
		const env = (
			McpMemory({
				env: { PATH: true as any },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("true");
	});

	it('PATH: "true" is kept and not overwritten', () => {
		process.env.PATH = "/from-process";
		const env = (
			McpTelegram({
				env: { TELEGRAM_BOT_TOKEN: "t", PATH: "true" },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("true");
	});

	it('PATH SameValueZero -0 becomes "0" then is falsy-overwritten', () => {
		process.env.PATH = "/from-process";
		const env = (
			McpMemory({
				env: { PATH: -0 as any },
			}) as any
		).config.transport.env;
		// String(-0) === "0", which is truthy — so kept, unlike numeric overwrite of "".
		expect(env.PATH).toBe("0");
	});

	it("empty PATH still overwritten (fourteenth control)", () => {
		process.env.PATH = "/from-process";
		const env = (
			McpMemory({
				env: { PATH: "" },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("/from-process");
	});
});
