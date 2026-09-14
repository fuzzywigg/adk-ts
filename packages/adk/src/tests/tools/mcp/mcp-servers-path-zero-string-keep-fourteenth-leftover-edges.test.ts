import { afterEach, describe, expect, it } from "vitest";
import { McpMemory, McpTelegram } from "../../../tools/mcp/servers";

/**
 * Fourteenth leftover: `if (!env.PATH)` only overwrites falsy PATH.
 * PATH: "0" is truthy and kept (unlike "" which is overwritten).
 */
describe("mcp servers PATH zero-string keep fourteenth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it('PATH: "0" is kept and not overwritten by process.env.PATH', () => {
		process.env.PATH = "/from-process";
		const env = (
			McpTelegram({
				env: { TELEGRAM_BOT_TOKEN: "t", PATH: "0" },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("0");
	});

	it('PATH: "false" is kept (truthy string)', () => {
		process.env.PATH = "/from-process";
		const env = (
			McpMemory({
				env: { PATH: "false" },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("false");
	});

	it("empty PATH still overwritten (control)", () => {
		process.env.PATH = "/from-process";
		const env = (
			McpTelegram({
				env: { TELEGRAM_BOT_TOKEN: "t", PATH: "" },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("/from-process");
	});
});
