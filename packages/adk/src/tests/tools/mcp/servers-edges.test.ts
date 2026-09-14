import { describe, expect, it, vi } from "vitest";
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
	type McpToolset,
} from "../../../tools/mcp";
import type { McpConfig, SamplingHandler } from "../../../tools/mcp/types";

function getConfig(toolset: McpToolset): McpConfig {
	return (toolset as unknown as { config: McpConfig }).config;
}

function expectStdio(config: McpConfig) {
	expect(config.transport.mode).toBe("stdio");
	if (config.transport.mode !== "stdio") {
		throw new Error("expected stdio transport");
	}
	return config.transport;
}

describe("MCP server factory leftover edges", () => {
	it("defaults description and retryOptions when only empty config is passed", () => {
		const config = getConfig(McpIqWiki({}));
		expect(config.description).toBe("Client for IQWiki MCP Client");
		expect(config.retryOptions).toEqual({ maxRetries: 2, initialDelay: 200 });
		expect(config.debug).toBe(false);
		expect(config.samplingHandler).toBeUndefined();
	});

	it("keeps an empty retryOptions object because || treats {} as truthy", () => {
		const config = getConfig(McpMemory({ retryOptions: {} }));
		expect(config.retryOptions).toEqual({});
	});

	it("falls back to default description when empty string is provided", () => {
		const config = getConfig(McpAbi({ description: "" }));
		expect(config.description).toBe("Client for ABI MCP Client");
	});

	it("preserves explicit debug false and partial retryOptions", () => {
		const config = getConfig(
			McpAtp({
				debug: false,
				retryOptions: { maxRetries: 1 },
			}),
		);
		expect(config.debug).toBe(false);
		expect(config.retryOptions).toEqual({ maxRetries: 1 });
	});

	it("coerces mixed env types and drops undefined entries for Telegram", () => {
		const config = getConfig(
			McpTelegram({
				env: {
					TELEGRAM_BOT_TOKEN: "placeholder-token",
					RETRY: 3,
					ENABLED: false,
					SKIP: undefined,
				},
			}),
		);
		const transport = expectStdio(config);
		expect(transport.env).toEqual({
			TELEGRAM_BOT_TOKEN: "placeholder-token",
			RETRY: "3",
			ENABLED: "false",
			PATH: process.env.PATH || "",
		});
	});

	it("wires Discord and Upbit package names with PATH defaults", () => {
		const discord = getConfig(
			McpDiscord({ env: { DISCORD_TOKEN: "placeholder-discord" } }),
		);
		const upbit = getConfig(
			McpUpbit({
				env: {
					UPBIT_ACCESS_KEY: "placeholder-access",
					UPBIT_SECRET_KEY: "placeholder-secret",
					UPBIT_ENABLE_TRADING: true,
				},
			}),
		);

		expect(expectStdio(discord).args).toEqual(["-y", "@iqai/mcp-discord"]);
		expect(expectStdio(discord).env?.DISCORD_TOKEN).toBe("placeholder-discord");
		expect(expectStdio(upbit).args).toEqual(["-y", "@iqai/mcp-upbit"]);
		expect(expectStdio(upbit).env?.UPBIT_ENABLE_TRADING).toBe("true");
	});

	it("covers Fraxlend, Odos, NearIntents, and Filesystem option matrices", () => {
		const samplingHandler: SamplingHandler = vi.fn();
		const cases: Array<[McpToolset, string]> = [
			[
				McpFraxlend({
					env: { WALLET_PRIVATE_KEY: "0xplaceholder" },
					debug: true,
				}),
				"@iqai/mcp-fraxlend",
			],
			[
				McpOdos({ env: { WALLET_PRIVATE_KEY: "0xplaceholder" } }),
				"@iqai/mcp-odos",
			],
			[
				McpNearIntents({
					env: {
						ACCOUNT_ID: "alice.near",
						ACCOUNT_KEY: "placeholder-key",
					},
					samplingHandler,
				}),
				"@iqai/mcp-near-intents",
			],
			[
				McpFilesystem({
					description: "fs custom",
					env: { ALLOWED_DIRECTORIES: "/tmp" },
				}),
				"@modelcontextprotocol/server-filesystem",
			],
		];

		for (const [toolset, pkg] of cases) {
			const config = getConfig(toolset);
			const transport = expectStdio(config);
			expect(transport.args).toEqual(["-y", pkg]);
			expect(transport.command).toBe("npx");
		}

		const near = getConfig(
			McpNearIntents({
				env: { ACCOUNT_ID: "alice.near", ACCOUNT_KEY: "placeholder-key" },
				samplingHandler,
			}),
		);
		expect(near.samplingHandler).toBe(samplingHandler);

		const fs = getConfig(
			McpFilesystem({
				description: "fs custom",
				env: { ALLOWED_DIRECTORIES: "/tmp" },
			}),
		);
		expect(fs.description).toBe("fs custom");
	});

	it("uses mcp-remote for https CoinGecko and preserves custom env PATH", () => {
		const config = getConfig(
			McpCoinGecko({
				env: { PATH: "/custom/gecko" },
				description: "gecko custom",
			}),
		);
		const transport = expectStdio(config);
		expect(config.description).toBe("gecko custom");
		expect(transport.args).toEqual([
			"-y",
			"mcp-remote@latest",
			"https://mcp.api.coingecko.com/mcp",
		]);
		expect(transport.env?.PATH).toBe("/custom/gecko");
	});

	it("configures CoinGecko Pro with samplingHandler and debug", () => {
		const samplingHandler: SamplingHandler = vi.fn();
		const config = getConfig(
			McpCoinGeckoPro({
				debug: true,
				samplingHandler,
				env: { COINGECKO_PRO_API_KEY: "placeholder-pro" },
			}),
		);
		const transport = expectStdio(config);
		expect(config.debug).toBe(true);
		expect(config.samplingHandler).toBe(samplingHandler);
		expect(transport.args).toEqual([
			"-y",
			"mcp-remote@latest",
			"https://mcp.pro-api.coingecko.com/mcp",
		]);
		expect(transport.env?.COINGECKO_PRO_API_KEY).toBe("placeholder-pro");
	});

	it("routes McpGeneric http URLs through mcp-remote and packages otherwise", () => {
		const remote = getConfig(
			McpGeneric("https://example.test/mcp", { debug: true }, "HTTP MCP"),
		);
		expect(remote.name).toBe("HTTP MCP");
		expect(expectStdio(remote).args).toEqual([
			"-y",
			"mcp-remote@latest",
			"https://example.test/mcp",
		]);

		const pkg = getConfig(McpGeneric("@scope/server", {}, "Named"));
		expect(pkg.name).toBe("Named");
		expect(expectStdio(pkg).args).toEqual(["-y", "@scope/server"]);
	});

	it("treats non-http URL-like strings as package names", () => {
		const ws = getConfig(McpGeneric("ws://localhost:8080/mcp"));
		expect(expectStdio(ws).args).toEqual(["-y", "ws://localhost:8080/mcp"]);

		const file = getConfig(McpGeneric("file:///tmp/mcp"));
		expect(expectStdio(file).args).toEqual(["-y", "file:///tmp/mcp"]);
	});

	it("builds Bamm and Polymarket with empty env still injecting PATH", () => {
		const bamm = getConfig(McpBamm());
		const poly = getConfig(McpPolymarket());
		expect(expectStdio(bamm).env?.PATH).toBe(process.env.PATH || "");
		expect(expectStdio(poly).env?.PATH).toBe(process.env.PATH || "");
		expect(expectStdio(bamm).args).toEqual(["-y", "@iqai/mcp-bamm"]);
		expect(expectStdio(poly).args).toEqual(["-y", "@iqai/mcp-polymarket"]);
	});

	it("defaults McpGeneric client name from package and NearAgent package path", () => {
		const generic = getConfig(McpGeneric("@iqai/mcp-custom"));
		expect(generic.name).toBe("@iqai/mcp-custom Client");

		const near = getConfig(McpNearAgent({ env: { ACCOUNT_ID: "bob.near" } }));
		expect(near.name).toBe("NEAR Agent MCP Client");
		expect(expectStdio(near).args).toEqual(["-y", "@iqai/mcp-near-agent"]);
		expect(expectStdio(near).env?.ACCOUNT_ID).toBe("bob.near");
	});
});
