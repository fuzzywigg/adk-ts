import { afterEach, describe, expect, it } from "vitest";
import { McpBamm, McpTelegram } from "../../../tools/mcp/servers";

/**
 * Fifteenth leftover: env values use String(v) when !== undefined.
 * boolean false → "false"; numeric 0 → "0" (null→"null" already thirteenth).
 */
describe("mcp servers env false-zero stringify fifteenth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it('String(false) → "false"; String(0) → "0"', () => {
		process.env.PATH = "/bin";
		const env = (
			McpBamm({
				env: {
					WALLET_PRIVATE_KEY: "k",
					FLAG: false,
					N: 0,
				},
			}) as any
		).config.transport.env;
		expect(env.FLAG).toBe("false");
		expect(env.N).toBe("0");
		expect(env.PATH).toBe("/bin");
	});

	it('string PATH "0" still kept (control from fourteenth)', () => {
		process.env.PATH = "/from-process";
		const env = (
			McpTelegram({
				env: { TELEGRAM_BOT_TOKEN: "t", PATH: "0" },
			}) as any
		).config.transport.env;
		expect(env.PATH).toBe("0");
	});
});
