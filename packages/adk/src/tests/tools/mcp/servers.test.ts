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

function expectStdioPackage(config: McpConfig, packageName: string) {
	expect(config.transport.mode).toBe("stdio");
	if (config.transport.mode !== "stdio") {
		throw new Error("expected stdio transport");
	}
	expect(config.transport.command).toBe("npx");
	expect(config.transport.args).toEqual(["-y", packageName]);
}

describe("MCP package server factories", () => {
	it("builds stdio transport for npm packages with defaults", () => {
		const config = getConfig(McpAbi());

		expect(config.name).toBe("ABI MCP Client");
		expect(config.description).toBe("Client for ABI MCP Client");
		expect(config.debug).toBe(false);
		expect(config.retryOptions).toEqual({ maxRetries: 2, initialDelay: 200 });
		expectStdioPackage(config, "@iqai/mcp-abi");
		if (config.transport.mode === "stdio") {
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

	it("defaults PATH to empty string when process.env.PATH is unset", () => {
		const originalPath = process.env.PATH;
		delete process.env.PATH;
		try {
			const config = getConfig(McpMemory());
			if (config.transport.mode !== "stdio") {
				throw new Error("expected stdio transport");
			}
			expect(config.transport.env?.PATH).toBe("");
		} finally {
			if (originalPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = originalPath;
			}
		}
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
		expectStdioPackage(config, "@iqai/mcp-near-agent");
		if (config.transport.mode === "stdio") {
			expect(config.transport.env?.ACCOUNT_ID).toBe("alice.near");
		}
	});

	it("covers remaining IQAI and third-party package factories", () => {
		const cases: Array<[string, McpToolset, string]> = [
			["IQWiki", McpIqWiki(), "@iqai/mcp-iqwiki"],
			["Telegram", McpTelegram(), "@iqai/mcp-telegram"],
			["Discord", McpDiscord(), "@iqai/mcp-discord"],
			["BAMM", McpBamm(), "@iqai/mcp-bamm"],
			["Fraxlend", McpFraxlend(), "@iqai/mcp-fraxlend"],
			["Near Intents", McpNearIntents(), "@iqai/mcp-near-intents"],
			["ODOS", McpOdos(), "@iqai/mcp-odos"],
			["Upbit", McpUpbit(), "@iqai/mcp-upbit"],
			["Polymarket", McpPolymarket(), "@iqai/mcp-polymarket"],
			[
				"Filesystem",
				McpFilesystem(),
				"@modelcontextprotocol/server-filesystem",
			],
			["Memory", McpMemory(), "@modelcontextprotocol/server-memory"],
		];

		for (const [, toolset, pkg] of cases) {
			const config = getConfig(toolset);
			expect(config.name).toContain("MCP Client");
			expectStdioPackage(config, pkg);
			expect(config.debug).toBe(false);
			expect(config.retryOptions).toEqual({
				maxRetries: 2,
				initialDelay: 200,
			});
		}
	});

	it("passes custom env through Bamm and Polymarket factories", () => {
		const bamm = getConfig(
			McpBamm({ env: { WALLET_PRIVATE_KEY: "0xabc", PATH: "/bamm" } }),
		);
		if (bamm.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(bamm.transport.env).toEqual({
			WALLET_PRIVATE_KEY: "0xabc",
			PATH: "/bamm",
		});

		const poly = getConfig(
			McpPolymarket({
				description: "poly custom",
				env: { FUNDER_ADDRESS: "0x1", POLYMARKET_PRIVATE_KEY: 99 },
			}),
		);
		expect(poly.description).toBe("poly custom");
		if (poly.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(poly.transport.env?.FUNDER_ADDRESS).toBe("0x1");
		expect(poly.transport.env?.POLYMARKET_PRIVATE_KEY).toBe("99");
		expect(poly.transport.env?.PATH).toBe(process.env.PATH || "");
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

	it("treats ftp and malformed URLs as package names, http as remote", () => {
		const ftp = getConfig(McpGeneric("ftp://files.example/mcp"));
		if (ftp.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(ftp.transport.args).toEqual(["-y", "ftp://files.example/mcp"]);

		const bad = getConfig(McpGeneric("://not-a-valid-url"));
		if (bad.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(bad.transport.args).toEqual(["-y", "://not-a-valid-url"]);

		const http = getConfig(
			McpGeneric("http://localhost:3100/mcp", { debug: true }, "Local MCP"),
		);
		expect(http.name).toBe("Local MCP");
		expect(http.debug).toBe(true);
		if (http.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(http.transport.args).toEqual([
			"-y",
			"mcp-remote@latest",
			"http://localhost:3100/mcp",
		]);
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
