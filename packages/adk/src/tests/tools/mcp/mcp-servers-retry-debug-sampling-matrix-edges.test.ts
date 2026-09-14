import { describe, expect, it, vi } from "vitest";
import {
	McpAbi,
	McpAtp,
	McpCoinGecko,
	McpGeneric,
	McpNearAgent,
	type McpToolset,
} from "../../../tools/mcp";
import type { McpConfig, SamplingHandler } from "../../../tools/mcp/types";

function getConfig(toolset: McpToolset): McpConfig {
	return (toolset as unknown as { config: McpConfig }).config;
}

describe("retry/debug/sampling cross-factory matrix", () => {
	const factories: Array<{
		label: string;
		build: (config: Parameters<typeof McpAbi>[0]) => McpToolset;
	}> = [
		{ label: "Abi", build: (c) => McpAbi(c) },
		{ label: "Atp", build: (c) => McpAtp(c) },
		{ label: "NearAgent", build: (c) => McpNearAgent(c) },
		{ label: "CoinGecko", build: (c) => McpCoinGecko(c) },
		{
			label: "Generic",
			build: (c) => McpGeneric("@matrix/pkg", c, "Matrix Client"),
		},
	];

	it.each(factories)("$label retryOptions truthiness matrix", ({ build }) => {
		expect(getConfig(build({})).retryOptions).toEqual({
			maxRetries: 2,
			initialDelay: 200,
		});
		expect(
			getConfig(build({ retryOptions: { maxRetries: 1 } })).retryOptions,
		).toEqual({ maxRetries: 1 });
		expect(
			getConfig(build({ retryOptions: { initialDelay: 0 } })).retryOptions,
		).toEqual({ initialDelay: 0 });
		expect(getConfig(build({ retryOptions: {} })).retryOptions).toEqual({});
	});

	it.each(factories)("$label debug truthiness matrix", ({ build }) => {
		expect(getConfig(build({})).debug).toBe(false);
		expect(getConfig(build({ debug: true })).debug).toBe(true);
		expect(getConfig(build({ debug: false })).debug).toBe(false);
	});

	it.each(
		factories,
	)("$label samplingHandler identity is preserved across calls", ({
		build,
	}) => {
		const first: SamplingHandler = vi.fn(async () => "a");
		const second: SamplingHandler = vi.fn(async () => "b");
		expect(getConfig(build({ samplingHandler: first })).samplingHandler).toBe(
			first,
		);
		expect(getConfig(build({ samplingHandler: second })).samplingHandler).toBe(
			second,
		);
		expect(first).not.toBe(second);
	});

	it("same samplingHandler instance can be shared across factories", () => {
		const shared: SamplingHandler = vi.fn();
		expect(getConfig(McpAbi({ samplingHandler: shared })).samplingHandler).toBe(
			shared,
		);
		expect(
			getConfig(McpCoinGecko({ samplingHandler: shared })).samplingHandler,
		).toBe(shared);
		expect(
			getConfig(McpGeneric("x", { samplingHandler: shared })).samplingHandler,
		).toBe(shared);
	});
});

describe("description coalesce cross-factory matrix", () => {
	it.each([
		{
			label: "Abi",
			build: (d?: string) => McpAbi(d === undefined ? {} : { description: d }),
			defaultName: "ABI MCP Client",
		},
		{
			label: "CoinGecko",
			build: (d?: string) =>
				McpCoinGecko(d === undefined ? {} : { description: d }),
			defaultName: "CoinGecko MCP Client",
		},
		{
			label: "Generic",
			build: (d?: string) =>
				McpGeneric("pkg", d === undefined ? {} : { description: d }, "Named"),
			defaultName: "Named",
		},
	] as const)("$label description || default", ({ build, defaultName }) => {
		expect(getConfig(build()).description).toBe(`Client for ${defaultName}`);
		expect(getConfig(build("custom")).description).toBe("custom");
		expect(getConfig(build("")).description).toBe(`Client for ${defaultName}`);
	});
});

describe("combined option orthogonality matrix", () => {
	it("debug/description/retry/env/sampling combine without clobbering transport mode", () => {
		const samplingHandler: SamplingHandler = vi.fn();
		const cases: McpConfig[] = [
			getConfig(
				McpAbi({
					debug: true,
					description: "a",
					retryOptions: { maxRetries: 3 },
					samplingHandler,
					env: { X: 1, PATH: "/a" },
				}),
			),
			getConfig(
				McpCoinGecko({
					debug: false,
					description: "",
					retryOptions: {},
					samplingHandler,
					env: { Y: false, PATH: "/c" },
				}),
			),
			getConfig(
				McpGeneric(
					"https://combo.example/mcp",
					{
						debug: true,
						description: "remote-combo",
						retryOptions: { initialDelay: 9 },
						samplingHandler,
						env: { Z: null, PATH: "/r" },
					},
					"Combo",
				),
			),
		];

		for (const config of cases) {
			expect(config.transport.mode).toBe("stdio");
			expect(config.samplingHandler).toBe(samplingHandler);
			if (config.transport.mode !== "stdio") {
				throw new Error("expected stdio");
			}
			expect(config.transport.command).toBe("npx");
			expect(config.transport.args[0]).toBe("-y");
		}

		expect(cases[0].debug).toBe(true);
		expect(cases[0].description).toBe("a");
		expect(cases[0].retryOptions).toEqual({ maxRetries: 3 });
		if (cases[0].transport.mode === "stdio") {
			expect(cases[0].transport.args).toEqual(["-y", "@iqai/mcp-abi"]);
			expect(cases[0].transport.env).toEqual({ X: "1", PATH: "/a" });
		}

		expect(cases[1].debug).toBe(false);
		expect(cases[1].description).toBe("Client for CoinGecko MCP Client");
		expect(cases[1].retryOptions).toEqual({});
		if (cases[1].transport.mode === "stdio") {
			expect(cases[1].transport.args[1]).toBe("mcp-remote@latest");
			expect(cases[1].transport.env).toEqual({ Y: "false", PATH: "/c" });
		}

		expect(cases[2].name).toBe("Combo");
		expect(cases[2].description).toBe("remote-combo");
		expect(cases[2].retryOptions).toEqual({ initialDelay: 9 });
		if (cases[2].transport.mode === "stdio") {
			expect(cases[2].transport.args).toEqual([
				"-y",
				"mcp-remote@latest",
				"https://combo.example/mcp",
			]);
			expect(cases[2].transport.env).toEqual({ Z: "null", PATH: "/r" });
		}
	});
});
