import { afterEach, describe, expect, it } from "vitest";
import { McpAtp, McpGeneric, McpMemory } from "../../../tools/mcp/servers";

/**
 * Thirteenth leftover: createMcpConfig uses `description ||`, `debug || false`,
 * `retryOptions || defaults`. Empty string/null collapse; whitespace/"0" keep.
 */
describe("mcp servers or-coalesce debug/description/retry thirteenth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it.each([
		{ label: "undefined", debug: undefined, expected: false },
		{ label: "null", debug: null, expected: false },
		{ label: "0", debug: 0, expected: false },
		{ label: "empty string", debug: "", expected: false },
		{ label: "false", debug: false, expected: false },
	])("debug $label coalesces to false via ||", ({ debug, expected }) => {
		const config = (McpMemory({ debug: debug as any }) as any).config;
		expect(config.debug).toBe(expected);
	});

	it('debug: "0" is truthy and kept (unlike numeric 0)', () => {
		expect((McpMemory({ debug: "0" as any }) as any).config.debug).toBe("0");
	});

	it.each([
		"",
		null,
		undefined,
		false,
		0,
	])("description %j coalesces to Client for ${name}", (description) => {
		const config = (McpMemory({ description: description as any }) as any)
			.config;
		expect(config.description).toBe("Client for Memory MCP Client");
	});

	it("whitespace description is kept (truthy || skip)", () => {
		expect((McpMemory({ description: "  " }) as any).config.description).toBe(
			"  ",
		);
	});

	it.each([
		null,
		undefined,
		0,
		false,
		"",
	])("retryOptions %j coalesces to {maxRetries:2, initialDelay:200}", (retryOptions) => {
		const config = (McpAtp({ retryOptions: retryOptions as any }) as any)
			.config;
		expect(config.retryOptions).toEqual({
			maxRetries: 2,
			initialDelay: 200,
		});
	});

	it("empty retryOptions object is truthy and kept (no defaults merged)", () => {
		expect((McpAtp({ retryOptions: {} }) as any).config.retryOptions).toEqual(
			{},
		);
	});

	it.each([
		"",
		null,
		undefined,
		false,
		0,
	])("McpGeneric name %j falls back to `${package} Client`", (name) => {
		const config = (McpGeneric("@example/pkg", {}, name as any) as any).config;
		expect(config.name).toBe("@example/pkg Client");
	});

	it("McpGeneric whitespace name is kept", () => {
		expect((McpGeneric("@example/pkg", {}, " ") as any).config.name).toBe(" ");
	});
});
