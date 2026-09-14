import { describe, expect, it, vi } from "vitest";
import {
	McpFilesystem,
	McpGeneric,
	McpMemory,
	type McpToolset,
} from "../../../tools/mcp";
import type { McpConfig, SamplingHandler } from "../../../tools/mcp/types";

function getConfig(toolset: McpToolset): McpConfig {
	return (toolset as unknown as { config: McpConfig }).config;
}

describe("third-party MCP factory matrix", () => {
	it.each([
		{
			label: "Filesystem",
			build: () => McpFilesystem(),
			name: "Filesystem MCP Client",
			pkg: "@modelcontextprotocol/server-filesystem",
		},
		{
			label: "Memory",
			build: () => McpMemory(),
			name: "Memory MCP Client",
			pkg: "@modelcontextprotocol/server-memory",
		},
	] as const)("$label defaults", ({ build, name, pkg }) => {
		const config = getConfig(build());
		expect(config.name).toBe(name);
		expect(config.description).toBe(`Client for ${name}`);
		expect(config.debug).toBe(false);
		expect(config.retryOptions).toEqual({ maxRetries: 2, initialDelay: 200 });
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(config.transport.args).toEqual(["-y", pkg]);
	});

	it.each([
		{
			label: "Filesystem",
			build: (c: Parameters<typeof McpFilesystem>[0]) => McpFilesystem(c),
			pkg: "@modelcontextprotocol/server-filesystem",
		},
		{
			label: "Memory",
			build: (c: Parameters<typeof McpMemory>[0]) => McpMemory(c),
			pkg: "@modelcontextprotocol/server-memory",
		},
	] as const)("$label config override matrix", ({ build, pkg }) => {
		const samplingHandler: SamplingHandler = vi.fn();
		const config = getConfig(
			build({
				debug: true,
				description: "third-party custom",
				retryOptions: { initialDelay: 2 },
				samplingHandler,
				env: {
					ALLOWED_DIRECTORIES: "/tmp,/var",
					PATH: "/tp",
					SKIP: undefined,
				},
			}),
		);
		expect(config.debug).toBe(true);
		expect(config.description).toBe("third-party custom");
		expect(config.retryOptions).toEqual({ initialDelay: 2 });
		expect(config.samplingHandler).toBe(samplingHandler);
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(config.transport.args).toEqual(["-y", pkg]);
		expect(config.transport.env).toEqual({
			ALLOWED_DIRECTORIES: "/tmp,/var",
			PATH: "/tp",
		});
	});
});

describe("McpGeneric matrix", () => {
	it.each([
		{
			label: "defaults name from package",
			packageName: "@scope/mcp-server",
			config: {},
			name: undefined,
			expectedName: "@scope/mcp-server Client",
			remote: false,
		},
		{
			label: "custom name wins",
			packageName: "@scope/mcp-server",
			config: { debug: true },
			name: "Custom Client",
			expectedName: "Custom Client",
			remote: false,
		},
		{
			label: "empty custom name falls back to package Client",
			packageName: "my-pkg",
			config: {},
			name: "",
			expectedName: "my-pkg Client",
			remote: false,
		},
		{
			label: "https packageName is remote with default name",
			packageName: "https://mcp.example/x",
			config: {},
			name: undefined,
			expectedName: "https://mcp.example/x Client",
			remote: true,
		},
		{
			label: "https with custom name",
			packageName: "https://mcp.example/x",
			config: { description: "remote" },
			name: "Remote",
			expectedName: "Remote",
			remote: true,
		},
	] as const)("$label", ({
		packageName,
		config,
		name,
		expectedName,
		remote,
	}) => {
		const result = getConfig(McpGeneric(packageName, config, name));
		expect(result.name).toBe(expectedName);
		if (result.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		if (remote) {
			expect(result.transport.args).toEqual([
				"-y",
				"mcp-remote@latest",
				packageName,
			]);
		} else {
			expect(result.transport.args).toEqual(["-y", packageName]);
		}
	});

	it("McpGeneric full config × package mode matrix", () => {
		const samplingHandler: SamplingHandler = vi.fn();
		const config = getConfig(
			McpGeneric(
				"@acme/mcp",
				{
					debug: true,
					description: "",
					retryOptions: {},
					samplingHandler,
					env: { A: 1, B: null, PATH: "/g", SKIP: undefined },
				},
				"Acme",
			),
		);
		expect(config.name).toBe("Acme");
		expect(config.debug).toBe(true);
		expect(config.description).toBe("Client for Acme");
		expect(config.retryOptions).toEqual({});
		expect(config.samplingHandler).toBe(samplingHandler);
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(config.transport.args).toEqual(["-y", "@acme/mcp"]);
		expect(config.transport.env).toEqual({
			A: "1",
			B: "null",
			PATH: "/g",
		});
	});

	it("McpGeneric two-arg form leaves samplingHandler undefined", () => {
		const config = getConfig(McpGeneric("solo-pkg", { debug: false }));
		expect(config.name).toBe("solo-pkg Client");
		expect(config.debug).toBe(false);
		expect(config.samplingHandler).toBeUndefined();
	});

	it("McpGeneric treats ftp URL-like strings as packages", () => {
		const config = getConfig(McpGeneric("ftp://x/y", {}, "FtpLike"));
		expect(config.name).toBe("FtpLike");
		if (config.transport.mode !== "stdio") {
			throw new Error("expected stdio");
		}
		expect(config.transport.args).toEqual(["-y", "ftp://x/y"]);
	});
});
