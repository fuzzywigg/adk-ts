import { describe, expect, it } from "vitest";
import {
	McpCoinGecko,
	McpGeneric,
	McpIqWiki,
	McpNearAgent,
} from "../../../tools/mcp/servers";
import type { McpConfig } from "../../../tools/mcp/types";

function getConfig(toolset: { config?: McpConfig } | object): McpConfig {
	return (toolset as { config: McpConfig }).config;
}

describe("MCP server wrappers", () => {
	it("McpGeneric builds stdio npx transport for package names", () => {
		const toolset = McpGeneric("@example/mcp-pkg", {
			debug: true,
			description: "Custom desc",
			retryOptions: { maxRetries: 1, initialDelay: 50 },
			env: { TOKEN: 123, FLAG: true },
		});
		const config = getConfig(toolset);

		expect(config.name).toBe("@example/mcp-pkg Client");
		expect(config.description).toBe("Custom desc");
		expect(config.debug).toBe(true);
		expect(config.retryOptions).toEqual({ maxRetries: 1, initialDelay: 50 });
		expect(config.transport.mode).toBe("stdio");
		if (config.transport.mode === "stdio") {
			expect(config.transport.command).toBe("npx");
			expect(config.transport.args).toEqual(["-y", "@example/mcp-pkg"]);
			expect(config.transport.env?.TOKEN).toBe("123");
			expect(config.transport.env?.FLAG).toBe("true");
			expect(config.transport.env?.PATH).toBeDefined();
		}
	});

	it("McpGeneric uses custom client name when provided", () => {
		const toolset = McpGeneric("@example/pkg", {}, "Named Client");
		expect(getConfig(toolset).name).toBe("Named Client");
	});

	it("McpCoinGecko uses mcp-remote for https endpoints", () => {
		const toolset = McpCoinGecko();
		const config = getConfig(toolset);

		expect(config.name).toBe("CoinGecko MCP Client");
		expect(config.transport.mode).toBe("stdio");
		if (config.transport.mode === "stdio") {
			expect(config.transport.args).toEqual([
				"-y",
				"mcp-remote@latest",
				"https://mcp.api.coingecko.com/mcp",
			]);
		}
	});

	it("McpNearAgent coerces env and defaults PATH", () => {
		const previousPath = process.env.PATH;
		process.env.PATH = "/fake/bin";
		try {
			const toolset = McpNearAgent({
				env: {
					ACCOUNT_ID: "alice.testnet",
					ACCOUNT_KEY: "fake-key",
					NEAR_NETWORK_ID: "testnet",
				},
			});
			const config = getConfig(toolset);
			expect(config.name).toBe("NEAR Agent MCP Client");
			if (config.transport.mode === "stdio") {
				expect(config.transport.args).toEqual(["-y", "@iqai/mcp-near-agent"]);
				expect(config.transport.env).toMatchObject({
					ACCOUNT_ID: "alice.testnet",
					ACCOUNT_KEY: "fake-key",
					NEAR_NETWORK_ID: "testnet",
					PATH: "/fake/bin",
				});
			}
		} finally {
			process.env.PATH = previousPath;
		}
	});

	it("McpIqWiki applies default retry options and description", () => {
		const config = getConfig(McpIqWiki());
		expect(config.description).toBe("Client for IQWiki MCP Client");
		expect(config.debug).toBe(false);
		expect(config.retryOptions).toEqual({ maxRetries: 2, initialDelay: 200 });
	});

	it("passes samplingHandler through without connecting", () => {
		const samplingHandler = async () => "ok";
		const toolset = McpGeneric("@example/pkg", { samplingHandler });
		expect(getConfig(toolset).samplingHandler).toBe(samplingHandler);
	});
});
