import { describe, expect, it, vi } from "vitest";
import {
	McpAbi,
	McpAtp,
	McpBamm,
	McpDiscord,
	McpFraxlend,
	McpIqWiki,
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

function expectPackage(config: McpConfig, name: string, packageName: string) {
	expect(config.name).toBe(name);
	expect(config.description).toBe(`Client for ${name}`);
	expect(config.debug).toBe(false);
	expect(config.retryOptions).toEqual({ maxRetries: 2, initialDelay: 200 });
	expect(config.transport.mode).toBe("stdio");
	if (config.transport.mode !== "stdio") {
		throw new Error("expected stdio");
	}
	expect(config.transport.command).toBe("npx");
	expect(config.transport.args).toEqual(["-y", packageName]);
	expect(config.transport.env?.PATH).toBe(process.env.PATH || "");
}

const IQAI_FACTORIES: Array<{
	label: string;
	build: () => McpToolset;
	name: string;
	pkg: string;
}> = [
	{
		label: "Abi",
		build: () => McpAbi(),
		name: "ABI MCP Client",
		pkg: "@iqai/mcp-abi",
	},
	{
		label: "Atp",
		build: () => McpAtp(),
		name: "ATP MCP Client",
		pkg: "@iqai/mcp-atp",
	},
	{
		label: "Bamm",
		build: () => McpBamm(),
		name: "BAMM MCP Client",
		pkg: "@iqai/mcp-bamm",
	},
	{
		label: "Fraxlend",
		build: () => McpFraxlend(),
		name: "Fraxlend MCP Client",
		pkg: "@iqai/mcp-fraxlend",
	},
	{
		label: "IqWiki",
		build: () => McpIqWiki(),
		name: "IQWiki MCP Client",
		pkg: "@iqai/mcp-iqwiki",
	},
	{
		label: "NearAgent",
		build: () => McpNearAgent(),
		name: "NEAR Agent MCP Client",
		pkg: "@iqai/mcp-near-agent",
	},
	{
		label: "NearIntents",
		build: () => McpNearIntents(),
		name: "Near Intents Swaps MCP Client",
		pkg: "@iqai/mcp-near-intents",
	},
	{
		label: "Odos",
		build: () => McpOdos(),
		name: "ODOS MCP Client",
		pkg: "@iqai/mcp-odos",
	},
	{
		label: "Telegram",
		build: () => McpTelegram(),
		name: "Telegram MCP Client",
		pkg: "@iqai/mcp-telegram",
	},
	{
		label: "Discord",
		build: () => McpDiscord(),
		name: "Discord MCP Client",
		pkg: "@iqai/mcp-discord",
	},
	{
		label: "Upbit",
		build: () => McpUpbit(),
		name: "Upbit MCP Client",
		pkg: "@iqai/mcp-upbit",
	},
	{
		label: "Polymarket",
		build: () => McpPolymarket(),
		name: "Polymarket MCP Client",
		pkg: "@iqai/mcp-polymarket",
	},
];

describe("IQAI MCP factory defaults matrix", () => {
	it.each(IQAI_FACTORIES)("$label wires fixed name/package defaults", ({
		build,
		name,
		pkg,
	}) => {
		expectPackage(getConfig(build()), name, pkg);
	});
});

describe("IQAI MCP factory config override matrix", () => {
	const builders: Array<{
		label: string;
		build: (config: Parameters<typeof McpAbi>[0]) => McpToolset;
		pkg: string;
	}> = [
		{ label: "Abi", build: (c) => McpAbi(c), pkg: "@iqai/mcp-abi" },
		{ label: "Atp", build: (c) => McpAtp(c), pkg: "@iqai/mcp-atp" },
		{ label: "Bamm", build: (c) => McpBamm(c), pkg: "@iqai/mcp-bamm" },
		{
			label: "Fraxlend",
			build: (c) => McpFraxlend(c),
			pkg: "@iqai/mcp-fraxlend",
		},
		{ label: "IqWiki", build: (c) => McpIqWiki(c), pkg: "@iqai/mcp-iqwiki" },
		{
			label: "NearAgent",
			build: (c) => McpNearAgent(c),
			pkg: "@iqai/mcp-near-agent",
		},
		{
			label: "NearIntents",
			build: (c) => McpNearIntents(c),
			pkg: "@iqai/mcp-near-intents",
		},
		{ label: "Odos", build: (c) => McpOdos(c), pkg: "@iqai/mcp-odos" },
		{
			label: "Telegram",
			build: (c) => McpTelegram(c),
			pkg: "@iqai/mcp-telegram",
		},
		{ label: "Discord", build: (c) => McpDiscord(c), pkg: "@iqai/mcp-discord" },
		{ label: "Upbit", build: (c) => McpUpbit(c), pkg: "@iqai/mcp-upbit" },
		{
			label: "Polymarket",
			build: (c) => McpPolymarket(c),
			pkg: "@iqai/mcp-polymarket",
		},
	];

	it.each(
		builders,
	)("$label accepts debug/description/retry/sampling/env overrides", ({
		build,
		pkg,
	}) => {
		const samplingHandler: SamplingHandler = vi.fn();
		const config = getConfig(
			build({
				debug: true,
				description: `${pkg} custom`,
				retryOptions: { maxRetries: 4, initialDelay: 11 },
				samplingHandler,
				env: {
					MARKER: 99,
					FLAG: false,
					PATH: `/override/${pkg}`,
					SKIP: undefined,
				},
			}),
		);

		expect(config.debug).toBe(true);
		expect(config.description).toBe(`${pkg} custom`);
		expect(config.retryOptions).toEqual({
			maxRetries: 4,
			initialDelay: 11,
		});
		expect(config.samplingHandler).toBe(samplingHandler);
		expect(config.transport.mode).toBe("stdio");
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(config.transport.args).toEqual(["-y", pkg]);
		expect(config.transport.env).toEqual({
			MARKER: "99",
			FLAG: "false",
			PATH: `/override/${pkg}`,
		});
	});

	it.each(
		builders,
	)("$label empty description falls back while keeping package args", ({
		build,
		pkg,
	}) => {
		const config = getConfig(build({ description: "" }));
		expect(config.description).toBe(`Client for ${config.name}`);
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(config.transport.args).toEqual(["-y", pkg]);
	});
});
