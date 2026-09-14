import { afterEach, describe, expect, it } from "vitest";
import {
	McpDiscord,
	McpGeneric,
	McpMemory,
	type McpToolset,
} from "../../../tools/mcp";
import type { McpConfig } from "../../../tools/mcp/types";

function getConfig(toolset: McpToolset): McpConfig {
	return (toolset as unknown as { config: McpConfig }).config;
}

function stdioEnv(config: McpConfig): Record<string, string> {
	expect(config.transport.mode).toBe("stdio");
	if (config.transport.mode !== "stdio") {
		throw new Error("expected stdio");
	}
	return config.transport.env ?? {};
}

const originalPath = process.env.PATH;

afterEach(() => {
	if (originalPath === undefined) {
		delete process.env.PATH;
	} else {
		process.env.PATH = originalPath;
	}
});

describe("createMcpConfig PATH fallback matrix", () => {
	it("injects process.env.PATH when caller omits PATH", () => {
		process.env.PATH = "/from/process";
		const env = stdioEnv(getConfig(McpMemory({ env: { NOTE: "1" } })));
		expect(env).toEqual({ NOTE: "1", PATH: "/from/process" });
	});

	it("injects empty PATH when process.env.PATH is unset", () => {
		delete process.env.PATH;
		const env = stdioEnv(getConfig(McpMemory()));
		expect(env.PATH).toBe("");
	});

	it("preserves non-empty PATH override; empty PATH is falsy and reinjected", () => {
		process.env.PATH = "/should-not-win";
		expect(
			stdioEnv(getConfig(McpDiscord({ env: { PATH: "/explicit" } }))).PATH,
		).toBe("/explicit");
		// createMcpConfig uses `if (!env.PATH)` so "" is treated as missing
		expect(stdioEnv(getConfig(McpDiscord({ env: { PATH: "" } }))).PATH).toBe(
			"/should-not-win",
		);
	});

	it("does not overwrite non-empty PATH from caller when process PATH differs", () => {
		process.env.PATH = "/proc";
		const env = stdioEnv(
			getConfig(
				McpGeneric("x", {
					env: { PATH: "/caller", TOKEN: 1 },
				}),
			),
		);
		expect(env).toEqual({ PATH: "/caller", TOKEN: "1" });
	});

	it("injects PATH after coercing other keys when PATH key was undefined", () => {
		process.env.PATH = "/injected";
		const env = stdioEnv(
			getConfig(
				McpMemory({
					env: {
						PATH: undefined,
						FLAG: true,
					},
				}),
			),
		);
		expect(env).toEqual({ FLAG: "true", PATH: "/injected" });
	});

	it.each([
		{ factory: "Memory", build: () => McpMemory() },
		{ factory: "Discord", build: () => McpDiscord() },
		{ factory: "Generic", build: () => McpGeneric("@scope/pkg") },
	] as const)("$factory injects PATH when env bag omitted entirely", ({
		build,
	}) => {
		process.env.PATH = "/all-factories";
		expect(stdioEnv(getConfig(build())).PATH).toBe("/all-factories");
	});
});
