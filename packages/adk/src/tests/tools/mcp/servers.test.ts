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

describe("MCP package server factories", () => {
	it("builds stdio transport for npm packages with defaults", () => {
		const config = getConfig(McpAbi());

		expect(config.name).toBe("ABI MCP Client");
		expect(config.description).toBe("Client for ABI MCP Client");
		expect(config.debug).toBe(false);
		expect(config.retryOptions).toEqual({ maxRetries: 2, initialDelay: 200 });
		expect(config.transport.mode).toBe("stdio");
		if (config.transport.mode === "stdio") {
			expect(config.transport.command).toBe("npx");
			expect(config.transport.args).toEqual(["-y", "@iqai/mcp-abi"]);
			expect(config.transport.env?.PATH).toBe(process.env.PATH || "");
		}
	});

	it("coerces env values to strings and preserves PATH override", () => {
		const config = getConfig(
			McpAtp({
				env: {
					ATP_API_KEY: 123,
					ATP_WALLET_PRIVATE_KEY: true,
					PATH: "/custom/bin",
					SKIP: undefined,
				},
			}),
		);

		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio transport");
		}
		expect(config.transport.env).toEqual({
			ATP_API_KEY: "123",
			ATP_WALLET_PRIVATE_KEY: "true",
			PATH: "/custom/bin",
		});
	});

	it("honors debug, description, retryOptions, and samplingHandler", () => {
		const samplingHandler: SamplingHandler = vi.fn();
		const config = getConfig(
			McpNearAgent({
				debug: true,
				description: "custom near",
				retryOptions: { maxRetries: 5, initialDelay: 10 },
				samplingHandler,
				env: { ACCOUNT_ID: "alice.near" },
			}),
		);

		expect(config.debug).toBe(true);
		expect(config.description).toBe("custom near");
		expect(config.retryOptions).toEqual({ maxRetries: 5, initialDelay: 10 });
		expect(config.samplingHandler).toBe(samplingHandler);
		if (config.transport.mode === "stdio") {
			expect(config.transport.args).toEqual(["-y", "@iqai/mcp-near-agent"]);
			expect(config.transport.env?.ACCOUNT_ID).toBe("alice.near");
		}
	});

	it("covers additional package factories", () => {
		expect(getConfig(McpIqWiki()).name).toBe("IQWiki MCP Client");
		expect(getConfig(McpTelegram()).name).toBe("Telegram MCP Client");
		expect(getConfig(McpDiscord()).name).toBe("Discord MCP Client");
		expect(getConfig(McpFilesystem()).transport.mode).toBe("stdio");
		expect(getConfig(McpMemory()).name).toBe("Memory MCP Client");
		expect(getConfig(McpBamm()).name).toBe("BAMM MCP Client");
		expect(getConfig(McpFraxlend()).name).toBe("Fraxlend MCP Client");
		expect(getConfig(McpNearIntents()).name).toBe(
			"Near Intents Swaps MCP Client",
		);
		expect(getConfig(McpOdos()).name).toBe("ODOS MCP Client");
		expect(getConfig(McpUpbit()).name).toBe("Upbit MCP Client");
		expect(getConfig(McpPolymarket()).name).toBe("Polymarket MCP Client");

		const bamm = getConfig(McpBamm({ env: { WALLET_PRIVATE_KEY: "k" } }));
		if (bamm.transport.mode === "stdio") {
			expect(bamm.transport.args).toEqual(["-y", "@iqai/mcp-bamm"]);
			expect(bamm.transport.env?.WALLET_PRIVATE_KEY).toBe("k");
		}

		const polymarket = getConfig(
			McpPolymarket({ env: { FUNDER_ADDRESS: "0xabc" } }),
		);
		if (polymarket.transport.mode === "stdio") {
			expect(polymarket.transport.args).toEqual(["-y", "@iqai/mcp-polymarket"]);
			expect(polymarket.transport.env?.FUNDER_ADDRESS).toBe("0xabc");
		}
	});
});

describe("MCP remote URL factories", () => {
	it("uses mcp-remote for http(s) endpoints", () => {
		const config = getConfig(McpCoinGecko());

		expect(config.name).toBe("CoinGecko MCP Client");
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio transport");
		}
		expect(config.transport.args).toEqual([
			"-y",
			"mcp-remote@latest",
			"https://mcp.api.coingecko.com/mcp",
		]);
	});

	it("configures CoinGecko Pro remote endpoint", () => {
		const config = getConfig(McpCoinGeckoPro({ debug: true }));

		expect(config.debug).toBe(true);
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio transport");
		}
		expect(config.transport.args).toEqual([
			"-y",
			"mcp-remote@latest",
			"https://mcp.pro-api.coingecko.com/mcp",
		]);
	});

	it("treats non-http strings as package names", () => {
		const config = getConfig(McpGeneric("not-a-url"));
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio transport");
		}
		expect(config.transport.args).toEqual(["-y", "not-a-url"]);
	});
});

describe("McpGeneric", () => {
	it("defaults client name from package name", () => {
		const config = getConfig(McpGeneric("@scope/mcp-server"));
		expect(config.name).toBe("@scope/mcp-server Client");
	});

	it("accepts a custom client name", () => {
		const config = getConfig(
			McpGeneric("@scope/mcp-server", { debug: true }, "Custom Client"),
		);
		expect(config.name).toBe("Custom Client");
		expect(config.debug).toBe(true);
	});
});
