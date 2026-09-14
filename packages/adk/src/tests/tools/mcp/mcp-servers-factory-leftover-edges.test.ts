import { afterEach, describe, expect, it, vi } from "vitest";
import {
	McpAbi,
	McpAtp,
	McpBamm,
	McpCoinGecko,
	McpCoinGeckoPro,
	McpDiscord,
	McpFilesystem,
	McpFraxlend,
	McpGeneric,
	McpIqWiki,
	McpMemory,
	McpNearAgent,
	McpNearIntents,
	McpOdos,
	McpPolymarket,
	McpTelegram,
	McpUpbit,
} from "../../../tools/mcp/servers";

describe("MCP servers factory leftover edges (post #141)", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it("package factories use stdio + npx -y package defaults", () => {
		const cases: Array<[string, () => any, string]> = [
			["ABI", () => McpAbi(), "@iqai/mcp-abi"],
			["ATP", () => McpAtp(), "@iqai/mcp-atp"],
			["BAMM", () => McpBamm(), "@iqai/mcp-bamm"],
			["Fraxlend", () => McpFraxlend(), "@iqai/mcp-fraxlend"],
			["IQWiki", () => McpIqWiki(), "@iqai/mcp-iqwiki"],
			["NEAR", () => McpNearAgent(), "@iqai/mcp-near-agent"],
			["NearIntents", () => McpNearIntents(), "@iqai/mcp-near-intents"],
			["ODOS", () => McpOdos(), "@iqai/mcp-odos"],
			["Telegram", () => McpTelegram(), "@iqai/mcp-telegram"],
			["Discord", () => McpDiscord(), "@iqai/mcp-discord"],
			["Upbit", () => McpUpbit(), "@iqai/mcp-upbit"],
			["Polymarket", () => McpPolymarket(), "@iqai/mcp-polymarket"],
			[
				"Filesystem",
				() => McpFilesystem(),
				"@modelcontextprotocol/server-filesystem",
			],
			["Memory", () => McpMemory(), "@modelcontextprotocol/server-memory"],
		];

		for (const [label, factory, pkg] of cases) {
			const toolset = factory();
			const config = (toolset as any).config;
			expect(config.transport.mode, label).toBe("stdio");
			expect(config.transport.command, label).toBe("npx");
			expect(config.transport.args, label).toEqual(["-y", pkg]);
			expect(config.debug, label).toBe(false);
			expect(config.retryOptions, label).toEqual({
				maxRetries: 2,
				initialDelay: 200,
			});
			expect(config.description, label).toContain("Client for");
		}
	});

	it.each([
		["http://example.test/mcp", true],
		["https://example.test/mcp", true],
		["HTTPS://example.test/mcp", true],
		["ftp://example.test/mcp", false],
		["not a url", false],
		["@scope/pkg", false],
		["", false],
	])("URL detection for %s → remote=%s", (input, isRemote) => {
		const toolset = McpGeneric(input);
		const args = (toolset as any).config.transport.args;
		if (isRemote) {
			expect(args).toEqual(["-y", "mcp-remote@latest", input]);
		} else {
			expect(args).toEqual(["-y", input]);
		}
	});

	it("CoinGecko factories use remote mcp-remote endpoints", () => {
		const free = (McpCoinGecko() as any).config.transport.args;
		const pro = (McpCoinGeckoPro() as any).config.transport.args;
		expect(free).toEqual([
			"-y",
			"mcp-remote@latest",
			"https://mcp.api.coingecko.com/mcp",
		]);
		expect(pro).toEqual([
			"-y",
			"mcp-remote@latest",
			"https://mcp.pro-api.coingecko.com/mcp",
		]);
	});

	it("coerces env values and skips undefined; defaults PATH from process", () => {
		process.env.PATH = "/custom/bin";
		const toolset = McpBamm({
			env: {
				WALLET_PRIVATE_KEY: "k",
				COUNT: 3,
				FLAG: true,
				SKIP: undefined,
			},
		});
		const env = (toolset as any).config.transport.env;
		expect(env).toEqual({
			WALLET_PRIVATE_KEY: "k",
			COUNT: "3",
			FLAG: "true",
			PATH: "/custom/bin",
		});
		expect(env).not.toHaveProperty("SKIP");
	});

	it("uses empty PATH when process.env.PATH is unset and env omits PATH", () => {
		delete process.env.PATH;
		const toolset = McpAtp({ env: { ATP_API_KEY: "x" } });
		expect((toolset as any).config.transport.env.PATH).toBe("");
		expect((toolset as any).config.transport.env.ATP_API_KEY).toBe("x");
	});

	it("preserves explicit PATH override over process.env.PATH", () => {
		process.env.PATH = "/from-process";
		const toolset = McpTelegram({
			env: { TELEGRAM_BOT_TOKEN: "t", PATH: "/override" },
		});
		expect((toolset as any).config.transport.env.PATH).toBe("/override");
	});

	it("passes debug, description, retryOptions, and samplingHandler through", () => {
		const samplingHandler = vi.fn();
		const toolset = McpNearAgent({
			debug: true,
			description: "custom near",
			retryOptions: { maxRetries: 9, initialDelay: 11 },
			samplingHandler: samplingHandler as any,
			env: { ACCOUNT_ID: "a", ACCOUNT_KEY: "b" },
		});
		const config = (toolset as any).config;
		expect(config.debug).toBe(true);
		expect(config.description).toBe("custom near");
		expect(config.retryOptions).toEqual({ maxRetries: 9, initialDelay: 11 });
		expect(config.samplingHandler).toBe(samplingHandler);
		expect(config.transport.env.ACCOUNT_ID).toBe("a");
	});

	it("McpGeneric defaults client name from package and accepts custom name", () => {
		const def = McpGeneric("@example/mcp-pkg");
		expect((def as any).config.name).toBe("@example/mcp-pkg Client");
		const named = McpGeneric("@example/mcp-pkg", {}, "Custom Client");
		expect((named as any).config.name).toBe("Custom Client");
		expect((named as any).config.description).toContain("Custom Client");
	});

	it("description fallback uses Client for ${name} when omitted", () => {
		const toolset = McpMemory();
		expect((toolset as any).config.description).toBe(
			"Client for Memory MCP Client",
		);
	});
});
