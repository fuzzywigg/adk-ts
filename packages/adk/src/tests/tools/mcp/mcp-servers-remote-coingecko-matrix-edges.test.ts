import { describe, expect, it, vi } from "vitest";
import {
	McpCoinGecko,
	McpCoinGeckoPro,
	type McpToolset,
} from "../../../tools/mcp";
import type { McpConfig, SamplingHandler } from "../../../tools/mcp/types";

function getConfig(toolset: McpToolset): McpConfig {
	return (toolset as unknown as { config: McpConfig }).config;
}

const PUBLIC_URL = "https://mcp.api.coingecko.com/mcp";
const PRO_URL = "https://mcp.pro-api.coingecko.com/mcp";

describe("CoinGecko remote factory matrix", () => {
	it("McpCoinGecko defaults to public remote endpoint", () => {
		const config = getConfig(McpCoinGecko());
		expect(config.name).toBe("CoinGecko MCP Client");
		expect(config.description).toBe("Client for CoinGecko MCP Client");
		expect(config.debug).toBe(false);
		expect(config.retryOptions).toEqual({ maxRetries: 2, initialDelay: 200 });
		expect(config.transport.mode).toBe("stdio");
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(config.transport.args).toEqual([
			"-y",
			"mcp-remote@latest",
			PUBLIC_URL,
		]);
		expect(config.transport.env?.PATH).toBe(process.env.PATH || "");
	});

	it("McpCoinGeckoPro defaults to pro remote endpoint", () => {
		const config = getConfig(McpCoinGeckoPro());
		expect(config.name).toBe("CoinGecko Pro MCP Client");
		expect(config.transport.mode).toBe("stdio");
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(config.transport.args).toEqual(["-y", "mcp-remote@latest", PRO_URL]);
	});

	it.each([
		{
			label: "public",
			build: McpCoinGecko,
			url: PUBLIC_URL,
			name: "CoinGecko MCP Client",
		},
		{
			label: "pro",
			build: McpCoinGeckoPro,
			url: PRO_URL,
			name: "CoinGecko Pro MCP Client",
		},
	] as const)("$label accepts full config overrides without changing remote URL", ({
		build,
		url,
		name,
	}) => {
		const samplingHandler: SamplingHandler = vi.fn();
		const config = getConfig(
			build({
				debug: true,
				description: `${name} custom`,
				retryOptions: { maxRetries: 0, initialDelay: 5 },
				samplingHandler,
				env: {
					COINGECKO_PRO_API_KEY: 123,
					PATH: "/cg",
					SKIP: undefined,
				},
			}),
		);

		expect(config.name).toBe(name);
		expect(config.debug).toBe(true);
		expect(config.description).toBe(`${name} custom`);
		expect(config.retryOptions).toEqual({
			maxRetries: 0,
			initialDelay: 5,
		});
		expect(config.samplingHandler).toBe(samplingHandler);
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(config.transport.args).toEqual(["-y", "mcp-remote@latest", url]);
		expect(config.transport.env).toEqual({
			COINGECKO_PRO_API_KEY: "123",
			PATH: "/cg",
		});
	});

	it.each([
		{ label: "public", build: McpCoinGecko },
		{ label: "pro", build: McpCoinGeckoPro },
	] as const)("$label empty description falls through to Client for name", ({
		build,
	}) => {
		const config = getConfig(build({ description: "" }));
		expect(config.description).toBe(`Client for ${config.name}`);
	});

	it("partial retryOptions on public CoinGecko is not merged with defaults", () => {
		const config = getConfig(McpCoinGecko({ retryOptions: { maxRetries: 7 } }));
		expect(config.retryOptions).toEqual({ maxRetries: 7 });
	});

	it("pro factory coerces boolean/null env values", () => {
		const config = getConfig(
			McpCoinGeckoPro({
				env: {
					ENABLED: true,
					DISABLED: false,
					EMPTY: null,
					PATH: "/pro",
				},
			}),
		);
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(config.transport.env).toEqual({
			ENABLED: "true",
			DISABLED: "false",
			EMPTY: "null",
			PATH: "/pro",
		});
	});
});
