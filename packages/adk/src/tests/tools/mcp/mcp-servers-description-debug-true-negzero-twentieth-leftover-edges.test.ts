import { afterEach, describe, expect, it } from "vitest";
import { McpMemory } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after #233 nineteenth):
 * createMcpConfig `description ||` / `debug || false` — boolean `true` /
 * `"true"` / `[]` / `NEGATIVE_INFINITY` kept; SameValueZero `-0` collapses.
 * Nineteenth pinned string `"0"`/`"false"` only.
 */
describe("mcp servers description/debug true/negzero twentieth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("description $label kept via ||", ({ value }) => {
		const config = (McpMemory({ description: value as any }) as any).config;
		expect(config.description).toBe(value);
	});

	it("description -0 collapses to Client for Memory MCP Client via ||", () => {
		const config = (McpMemory({ description: -0 as any }) as any).config;
		expect(config.description).toBe("Client for Memory MCP Client");
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("debug $label kept via || false", ({ value }) => {
		expect((McpMemory({ debug: value as any }) as any).config.debug).toBe(
			value,
		);
	});

	it("debug -0 collapses to false via ||", () => {
		expect((McpMemory({ debug: -0 as any }) as any).config.debug).toBe(false);
	});
});
