import { afterEach, describe, expect, it } from "vitest";
import { McpBamm, McpTelegram } from "../../../tools/mcp/servers";

/**
 * Thirteenth leftover: env skips only `!== undefined` so null becomes "null";
 * `if (!env.PATH)` treats "" as missing and overwrites from process.env.PATH.
 */
describe("mcp servers env null vs empty PATH thirteenth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it('String(null) becomes "null"; undefined is still skipped', () => {
		process.env.PATH = "/bin";
		const env = (
			McpBamm({
				env: {
					WALLET_PRIVATE_KEY: "k",
					EMPTY: null,
					SKIP: undefined,
				},
			}) as any
		).config.transport.env;
		expect(env.EMPTY).toBe("null");
		expect(env).not.toHaveProperty("SKIP");
		expect(env.PATH).toBe("/bin");
	});

	it("empty-string PATH is overwritten by process.env.PATH", () => {
		process.env.PATH = "/from-process";
		const env = (
			McpTelegram({
				env: { TELEGRAM_BOT_TOKEN: "t", PATH: "" },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("/from-process");
	});

	it("whitespace PATH is kept (truthy)", () => {
		process.env.PATH = "/from-process";
		const env = (
			McpTelegram({
				env: { TELEGRAM_BOT_TOKEN: "t", PATH: " " },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe(" ");
	});
});
