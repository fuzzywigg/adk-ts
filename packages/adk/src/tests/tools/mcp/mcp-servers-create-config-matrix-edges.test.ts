import { describe, expect, it, vi } from "vitest";
import {
	McpAbi,
	McpGeneric,
	McpMemory,
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

describe("createMcpConfig description/debug/retry defaults matrix", () => {
	it.each([
		{
			label: "omitted description uses Client for name",
			config: {},
			expectedDescription: "Client for ABI MCP Client",
		},
		{
			label: "custom description wins",
			config: { description: "custom abi" },
			expectedDescription: "custom abi",
		},
		{
			label: "empty description falls through to default",
			config: { description: "" },
			expectedDescription: "Client for ABI MCP Client",
		},
	] as const)("$label", ({ config, expectedDescription }) => {
		const result = getConfig(McpAbi(config));
		expect(result.description).toBe(expectedDescription);
	});

	it.each([
		{ label: "omitted debug → false", config: {}, expected: false },
		{ label: "debug true", config: { debug: true }, expected: true },
		{ label: "debug false", config: { debug: false }, expected: false },
	] as const)("$label", ({ config, expected }) => {
		expect(getConfig(McpAbi(config)).debug).toBe(expected);
	});

	it.each([
		{
			label: "omitted retryOptions → defaults",
			config: {},
			expected: { maxRetries: 2, initialDelay: 200 },
		},
		{
			label: "full retryOptions override",
			config: { retryOptions: { maxRetries: 9, initialDelay: 1 } },
			expected: { maxRetries: 9, initialDelay: 1 },
		},
		{
			label: "partial retryOptions passes through without merge",
			config: { retryOptions: { maxRetries: 0 } },
			expected: { maxRetries: 0 },
		},
		{
			label: "empty retryOptions object is truthy and not replaced",
			config: { retryOptions: {} },
			expected: {},
		},
		{
			label: "initialDelay-only partial",
			config: { retryOptions: { initialDelay: 33 } },
			expected: { initialDelay: 33 },
		},
	] as const)("$label", ({ config, expected }) => {
		expect(getConfig(McpAbi(config)).retryOptions).toEqual(expected);
	});

	it("passes samplingHandler through including explicit undefined", () => {
		const handler: SamplingHandler = vi.fn();
		expect(
			getConfig(McpAbi({ samplingHandler: handler })).samplingHandler,
		).toBe(handler);
		expect(
			getConfig(McpAbi({ samplingHandler: undefined })).samplingHandler,
		).toBeUndefined();
		expect(getConfig(McpAbi()).samplingHandler).toBeUndefined();
	});
});

describe("createMcpConfig transport shell matrix", () => {
	it("always uses npx stdio for package factories", () => {
		const transport = expectStdio(getConfig(McpAbi()));
		expect(transport.command).toBe("npx");
		expect(transport.args).toEqual(["-y", "@iqai/mcp-abi"]);
	});

	it("uses mcp-remote args for http URLs via McpGeneric", () => {
		const transport = expectStdio(
			getConfig(McpGeneric("https://example.test/mcp")),
		);
		expect(transport.args).toEqual([
			"-y",
			"mcp-remote@latest",
			"https://example.test/mcp",
		]);
	});

	it("combines custom name, debug, and remote URL on McpGeneric", () => {
		const config = getConfig(
			McpGeneric(
				"http://127.0.0.1:9/mcp",
				{ debug: true, description: "local" },
				"Local Client",
			),
		);
		expect(config.name).toBe("Local Client");
		expect(config.debug).toBe(true);
		expect(config.description).toBe("local");
		expect(expectStdio(config).args).toEqual([
			"-y",
			"mcp-remote@latest",
			"http://127.0.0.1:9/mcp",
		]);
	});

	it("Memory factory wires defaults without caller config", () => {
		const config = getConfig(McpMemory());
		expect(config.name).toBe("Memory MCP Client");
		expect(config.description).toBe("Client for Memory MCP Client");
		expect(config.debug).toBe(false);
		expect(config.retryOptions).toEqual({ maxRetries: 2, initialDelay: 200 });
		expect(expectStdio(config).args).toEqual([
			"-y",
			"@modelcontextprotocol/server-memory",
		]);
	});
});
