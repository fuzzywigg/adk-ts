import { describe, expect, it } from "vitest";
import { McpGeneric, type McpToolset } from "../../../tools/mcp";
import type { McpConfig } from "../../../tools/mcp/types";

function getConfig(toolset: McpToolset): McpConfig {
	return (toolset as unknown as { config: McpConfig }).config;
}

function argsOf(config: McpConfig): string[] {
	expect(config.transport.mode).toBe("stdio");
	if (config.transport.mode !== "stdio") {
		throw new Error("expected stdio");
	}
	return config.transport.args;
}

describe("createMcpConfig URL detection matrix", () => {
	it.each([
		{
			label: "https URL → mcp-remote",
			input: "https://mcp.example.com/path",
			remote: true,
		},
		{
			label: "http URL → mcp-remote",
			input: "http://localhost:3100/mcp",
			remote: true,
		},
		{
			label: "HTTPS uppercase scheme still remote",
			input: "HTTPS://MCP.EXAMPLE.COM/MCP",
			remote: true,
		},
		{
			label: "HTTP uppercase scheme still remote",
			input: "HTTP://127.0.0.1/mcp",
			remote: true,
		},
		{
			label: "https with query/hash",
			input: "https://ex.test/mcp?x=1#frag",
			remote: true,
		},
		{
			label: "ftp scheme → package mode",
			input: "ftp://files.example/mcp",
			remote: false,
		},
		{
			label: "ws scheme → package mode",
			input: "ws://localhost:8080/mcp",
			remote: false,
		},
		{
			label: "wss scheme → package mode",
			input: "wss://localhost:8080/mcp",
			remote: false,
		},
		{
			label: "file scheme → package mode",
			input: "file:///tmp/mcp",
			remote: false,
		},
		{
			label: "mailto scheme → package mode",
			input: "mailto:user@example.com",
			remote: false,
		},
		{
			label: "malformed :// → package mode",
			input: "://not-a-valid-url",
			remote: false,
		},
		{
			label: "bare package name",
			input: "@iqai/mcp-abi",
			remote: false,
		},
		{
			label: "relative path string",
			input: "./local-server",
			remote: false,
		},
		{
			label: "empty string",
			input: "",
			remote: false,
		},
	] as const)("$label", ({ input, remote }) => {
		const args = argsOf(getConfig(McpGeneric(input)));
		if (remote) {
			expect(args).toEqual(["-y", "mcp-remote@latest", input]);
		} else {
			expect(args).toEqual(["-y", input]);
		}
	});

	it("remote detection is independent of config debug/retry/env", () => {
		const config = getConfig(
			McpGeneric(
				"https://pro.example/mcp",
				{
					debug: true,
					retryOptions: { maxRetries: 1 },
					env: { TOKEN: "t", PATH: "/p" },
				},
				"Named",
			),
		);
		expect(config.name).toBe("Named");
		expect(config.debug).toBe(true);
		expect(argsOf(config)).toEqual([
			"-y",
			"mcp-remote@latest",
			"https://pro.example/mcp",
		]);
		if (config.transport.mode === "stdio") {
			expect(config.transport.env).toEqual({ TOKEN: "t", PATH: "/p" });
		}
	});

	it("package mode keeps custom client name and package args", () => {
		const config = getConfig(
			McpGeneric("not-a-url", { description: "pkg" }, "Custom"),
		);
		expect(config.name).toBe("Custom");
		expect(config.description).toBe("pkg");
		expect(argsOf(config)).toEqual(["-y", "not-a-url"]);
	});
});
