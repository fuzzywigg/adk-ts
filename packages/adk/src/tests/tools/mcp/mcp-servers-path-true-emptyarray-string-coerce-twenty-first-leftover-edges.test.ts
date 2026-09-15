import { afterEach, describe, expect, it } from "vitest";
import { McpMemory, McpTelegram } from "../../../tools/mcp/servers";

/**
 * Twenty-first leftover (HEAVY tip-relaunch residual after fourteenth `"0"`/
 * `"false"` keep): `String(value)` then `if (!env.PATH)` — `PATH: true` →
 * `"true"` keep; `PATH: false` → `"false"` keep; `PATH: -0` → `"0"` keep;
 * `PATH: []` → `""` overwrite. Fourteenth pinned string-zero / string-false.
 */
describe("mcp servers PATH true/emptyarray string-coerce twenty-first leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it('PATH: true coerces to "true" and is kept', () => {
		process.env.PATH = "/from-process";
		const env = (
			McpTelegram({
				env: { TELEGRAM_BOT_TOKEN: "t", PATH: true as any },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("true");
	});

	it('PATH: false coerces to "false" and is kept (truthy string)', () => {
		process.env.PATH = "/from-process";
		const env = (
			McpMemory({
				env: { PATH: false as any },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("false");
	});

	it('PATH: -0 coerces to "0" and is kept (SameValueZero after String)', () => {
		process.env.PATH = "/from-process";
		const env = (
			McpTelegram({
				env: { TELEGRAM_BOT_TOKEN: "t", PATH: -0 as any },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("0");
	});

	it('PATH: [] coerces to "" then overwritten by process.env.PATH', () => {
		process.env.PATH = "/from-process";
		const env = (
			McpMemory({
				env: { PATH: [] as any },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("/from-process");
	});
});
