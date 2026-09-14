import { describe, expect, it } from "vitest";
import { McpAtp, McpGeneric, type McpToolset } from "../../../tools/mcp";
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

describe("createMcpConfig env coercion matrix", () => {
	it.each([
		{ label: "number 0", value: 0, expected: "0" },
		{ label: "number 42", value: 42, expected: "42" },
		{ label: "boolean true", value: true, expected: "true" },
		{ label: "boolean false", value: false, expected: "false" },
		{ label: "null → 'null'", value: null, expected: "null" },
		{ label: "empty string", value: "", expected: "" },
		{ label: "bigint", value: BigInt(7), expected: "7" },
		{ label: "empty array", value: [], expected: "" },
		{ label: "array values", value: [1, 2], expected: "1,2" },
		{ label: "plain object", value: { a: 1 }, expected: "[object Object]" },
		{ label: "symbol", value: Symbol.for("k"), expected: "Symbol(k)" },
	] as const)("String-coerces $label", ({ value, expected }) => {
		const env = stdioEnv(
			getConfig(
				McpAtp({
					env: {
						ATP_API_KEY: value as any,
						PATH: "/bin",
					},
				}),
			),
		);
		expect(env.ATP_API_KEY).toBe(expected);
		expect(env.PATH).toBe("/bin");
		expect(env).not.toHaveProperty("SKIP");
	});

	it("skips undefined env entries but keeps neighboring keys", () => {
		const env = stdioEnv(
			getConfig(
				McpAtp({
					env: {
						ATP_API_KEY: "keep",
						ATP_WALLET_PRIVATE_KEY: undefined,
						PATH: "/x",
						EXTRA: undefined,
					},
				}),
			),
		);
		expect(env).toEqual({
			ATP_API_KEY: "keep",
			PATH: "/x",
		});
	});

	it("coerces mixed multi-key env bags in one pass", () => {
		const env = stdioEnv(
			getConfig(
				McpGeneric("pkg", {
					env: {
						A: 1,
						B: false,
						C: null,
						D: undefined,
						E: { nested: true },
						PATH: "/mixed",
					},
				}),
			),
		);
		expect(env).toEqual({
			A: "1",
			B: "false",
			C: "null",
			E: "[object Object]",
			PATH: "/mixed",
		});
	});

	it("omits env object entirely when caller passes empty env", () => {
		const env = stdioEnv(getConfig(McpAtp({ env: {} })));
		expect(env.PATH).toBe(process.env.PATH || "");
		expect(Object.keys(env)).toEqual(["PATH"]);
	});

	it("treats missing env as empty and still injects PATH", () => {
		const env = stdioEnv(getConfig(McpAtp()));
		expect(env).toEqual({ PATH: process.env.PATH || "" });
	});
});
